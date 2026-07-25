// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {IOddsIndexOracle} from "./interfaces/IOddsIndexOracle.sol";
import {OptionPool} from "./OptionPool.sol";

/// @title BinaryOption
/// @notice Fully collateralized ERC-1155 odds options settled from OddsIndexOracle.
contract BinaryOption is
    ERC1155,
    Pausable,
    ReentrancyGuard,
    AccessControlDefaultAdminRules
{
    using SafeERC20 for IERC20;

    enum Side {
        Above,
        Below
    }

    struct Series {
        bytes32 marketId;
        uint32 strike;
        uint64 expiry;
        uint96 abovePremium;
        uint96 belowPremium;
        uint128 totalAbove;
        uint128 totalBelow;
        uint32 settlementPrice;
        Side winningSide;
        bool settled;
    }

    bytes32 public constant SERIES_MANAGER_ROLE = keccak256("SERIES_MANAGER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    uint32 public constant PRICE_SCALE = 1_000_000;

    IERC20 public immutable collateral;
    IOddsIndexOracle public immutable oracle;
    OptionPool public immutable pool;
    uint256 public immutable payoutPerContract;

    uint64 public seriesCount;
    mapping(uint64 seriesId => Series series) private _series;

    error ZeroAddress();
    error InvalidStrike(uint32 strike);
    error InvalidExpiry(uint64 expiry);
    error InvalidPremium(uint256 premium);
    error InvalidAmount();
    error SeriesNotFound(uint64 seriesId);
    error SeriesExpired(uint64 seriesId);
    error SeriesNotExpired(uint64 seriesId);
    error SeriesAlreadySettled(uint64 seriesId);
    error SeriesNotSettled(uint64 seriesId);
    error SettlementNotFinalized(bytes32 marketId, uint64 expiry);
    error SlippageExceeded(uint256 premium, uint256 maximumPremium);
    error AmountOverflow();
    error MarketUnavailable(bytes32 marketId, IOddsIndexOracle.MarketStatus status);

    event SeriesCreated(
        uint64 indexed seriesId,
        bytes32 indexed marketId,
        uint32 strike,
        uint64 expiry,
        uint96 abovePremium,
        uint96 belowPremium
    );
    event BetPlaced(
        address indexed buyer,
        uint64 indexed seriesId,
        Side indexed side,
        uint128 amount,
        uint256 premium,
        uint256 tokenId
    );
    event SeriesSettled(
        uint64 indexed seriesId,
        uint32 settlementPrice,
        Side winningSide,
        uint256 releasedCollateral
    );
    event Claimed(
        address indexed account,
        uint64 indexed seriesId,
        Side indexed side,
        uint128 amount,
        uint256 payout
    );

    constructor(
        IERC20 collateral_,
        IOddsIndexOracle oracle_,
        OptionPool pool_,
        address initialAdmin,
        address initialSeriesManager,
        string memory metadataUri,
        uint48 adminTransferDelay
    )
        ERC1155(metadataUri)
        AccessControlDefaultAdminRules(adminTransferDelay, initialAdmin)
    {
        if (
            address(collateral_) == address(0) || address(oracle_) == address(0)
                || address(pool_) == address(0) || initialAdmin == address(0)
                || initialSeriesManager == address(0)
        ) {
            revert ZeroAddress();
        }

        uint8 collateralDecimals = IERC20Metadata(address(collateral_)).decimals();
        if (collateralDecimals > 18) revert InvalidPremium(collateralDecimals);

        collateral = collateral_;
        oracle = oracle_;
        pool = pool_;
        payoutPerContract = 10 ** collateralDecimals;

        _grantRole(SERIES_MANAGER_ROLE, initialSeriesManager);
        _grantRole(PAUSER_ROLE, initialAdmin);
    }

    function createSeries(
        bytes32 marketId,
        uint32 strike,
        uint64 expiry,
        uint96 abovePremium,
        uint96 belowPremium
    ) external onlyRole(SERIES_MANAGER_ROLE) returns (uint64 seriesId) {
        if (strike == 0 || strike >= PRICE_SCALE) revert InvalidStrike(strike);
        if (expiry <= block.timestamp) revert InvalidExpiry(expiry);
        if (
            abovePremium == 0 || abovePremium >= payoutPerContract || belowPremium == 0
                || belowPremium >= payoutPerContract
        ) {
            revert InvalidPremium(
                abovePremium == 0 || abovePremium >= payoutPerContract
                    ? abovePremium
                    : belowPremium
            );
        }

        IOddsIndexOracle.MarketConfig memory config = oracle.marketConfig(marketId);
        if (config.status != IOddsIndexOracle.MarketStatus.Active) {
            revert MarketUnavailable(marketId, config.status);
        }

        seriesId = ++seriesCount;
        _series[seriesId] = Series({
            marketId: marketId,
            strike: strike,
            expiry: expiry,
            abovePremium: abovePremium,
            belowPremium: belowPremium,
            totalAbove: 0,
            totalBelow: 0,
            settlementPrice: 0,
            winningSide: Side.Above,
            settled: false
        });

        emit SeriesCreated(
            seriesId,
            marketId,
            strike,
            expiry,
            abovePremium,
            belowPremium
        );
    }

    function buy(uint64 seriesId, Side side, uint128 amount, uint256 maximumPremium)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 premium)
    {
        if (amount == 0) revert InvalidAmount();
        Series storage optionSeries = _requireSeries(seriesId);
        if (block.timestamp >= optionSeries.expiry) revert SeriesExpired(seriesId);
        if (optionSeries.settled) revert SeriesAlreadySettled(seriesId);

        uint256 unitPremium =
            side == Side.Above ? optionSeries.abovePremium : optionSeries.belowPremium;
        premium = unitPremium * amount;
        if (premium > maximumPremium) {
            revert SlippageExceeded(premium, maximumPremium);
        }

        uint256 nominal = payoutPerContract * amount;
        collateral.safeTransferFrom(msg.sender, address(pool), premium);
        pool.reserve(nominal);

        if (side == Side.Above) {
            uint256 newTotal = uint256(optionSeries.totalAbove) + amount;
            if (newTotal > type(uint128).max) revert AmountOverflow();
            optionSeries.totalAbove = uint128(newTotal);
        } else {
            uint256 newTotal = uint256(optionSeries.totalBelow) + amount;
            if (newTotal > type(uint128).max) revert AmountOverflow();
            optionSeries.totalBelow = uint128(newTotal);
        }

        uint256 tokenId = tokenIdFor(seriesId, side);
        _mint(msg.sender, tokenId, amount, "");
        emit BetPlaced(msg.sender, seriesId, side, amount, premium, tokenId);
    }

    function settleSeries(uint64 seriesId)
        external
        whenNotPaused
        returns (Side winningSide)
    {
        Series storage optionSeries = _requireSeries(seriesId);
        if (block.timestamp < optionSeries.expiry) revert SeriesNotExpired(seriesId);
        if (optionSeries.settled) revert SeriesAlreadySettled(seriesId);

        IOddsIndexOracle.Settlement memory settlement =
            oracle.getSettlementPrice(optionSeries.marketId, optionSeries.expiry);
        if (!settlement.finalized) {
            revert SettlementNotFinalized(optionSeries.marketId, optionSeries.expiry);
        }

        // Equality belongs to ABOVE so every series always has exactly one winner.
        winningSide = settlement.price >= optionSeries.strike ? Side.Above : Side.Below;
        optionSeries.settlementPrice = settlement.price;
        optionSeries.winningSide = winningSide;
        optionSeries.settled = true;

        uint256 losingContracts = winningSide == Side.Above
            ? optionSeries.totalBelow
            : optionSeries.totalAbove;
        uint256 releasedCollateral = losingContracts * payoutPerContract;
        if (releasedCollateral != 0) {
            pool.release(releasedCollateral);
        }

        emit SeriesSettled(
            seriesId,
            settlement.price,
            winningSide,
            releasedCollateral
        );
    }

    function claim(uint64 seriesId, Side side, uint128 amount)
        external
        nonReentrant
        returns (uint256 payout)
    {
        if (amount == 0) revert InvalidAmount();
        Series storage optionSeries = _requireSeries(seriesId);
        if (!optionSeries.settled) revert SeriesNotSettled(seriesId);

        _burn(msg.sender, tokenIdFor(seriesId, side), amount);
        if (side == optionSeries.winningSide) {
            payout = payoutPerContract * amount;
            pool.payout(msg.sender, payout);
        }

        emit Claimed(msg.sender, seriesId, side, amount, payout);
    }

    function quote(uint64 seriesId, Side side, uint128 amount)
        external
        view
        returns (uint256 premium, uint256 maximumPayout)
    {
        Series storage optionSeries = _requireSeries(seriesId);
        uint256 unitPremium =
            side == Side.Above ? optionSeries.abovePremium : optionSeries.belowPremium;
        return (unitPremium * amount, payoutPerContract * amount);
    }

    function series(uint64 seriesId) external view returns (Series memory) {
        return _requireSeries(seriesId);
    }

    function tokenIdFor(uint64 seriesId, Side side) public pure returns (uint256) {
        return uint256(seriesId) * 2 + uint8(side);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControlDefaultAdminRules)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _requireSeries(uint64 seriesId)
        private
        view
        returns (Series storage optionSeries)
    {
        optionSeries = _series[seriesId];
        if (optionSeries.marketId == bytes32(0)) revert SeriesNotFound(seriesId);
    }
}

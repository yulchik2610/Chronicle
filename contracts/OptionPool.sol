// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title OptionPool
/// @notice ERC-4626 underwriting vault backing Chronicle binary option payouts.
contract OptionPool is ERC4626, AccessControlDefaultAdminRules, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant OPTION_OPERATOR_ROLE = keccak256("OPTION_OPERATOR_ROLE");
    uint16 public constant BPS = 10_000;

    uint16 public immutable utilizationCapBps;
    uint256 public reservedCollateral;
    address public optionOperator;

    error InvalidUtilizationCap(uint16 utilizationCapBps);
    error ZeroAddress();
    error UtilizationExceeded(uint256 requestedReserve, uint256 maximumReserve);
    error InsufficientReservedCollateral(uint256 requested, uint256 reserved);

    event OptionOperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event CollateralReserved(uint256 amount, uint256 totalReserved);
    event CollateralReleased(uint256 amount, uint256 totalReserved);
    event OptionPayout(address indexed receiver, uint256 amount, uint256 totalReserved);

    constructor(
        IERC20 asset_,
        address initialAdmin,
        uint16 utilizationCapBps_,
        uint48 adminTransferDelay
    )
        ERC20("Chronicle Option LP", "cOLP")
        ERC4626(asset_)
        AccessControlDefaultAdminRules(adminTransferDelay, initialAdmin)
    {
        if (address(asset_) == address(0) || initialAdmin == address(0)) {
            revert ZeroAddress();
        }
        if (utilizationCapBps_ == 0 || utilizationCapBps_ > BPS) {
            revert InvalidUtilizationCap(utilizationCapBps_);
        }
        utilizationCapBps = utilizationCapBps_;
    }

    function setOptionOperator(address newOperator)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (newOperator == address(0)) revert ZeroAddress();

        address previous = optionOperator;
        if (previous != address(0)) {
            _revokeRole(OPTION_OPERATOR_ROLE, previous);
        }

        optionOperator = newOperator;
        _grantRole(OPTION_OPERATOR_ROLE, newOperator);
        emit OptionOperatorUpdated(previous, newOperator);
    }

    function reserve(uint256 amount) external onlyRole(OPTION_OPERATOR_ROLE) {
        uint256 newReserved = reservedCollateral + amount;
        uint256 maximumReserve = (totalAssets() * utilizationCapBps) / BPS;
        if (newReserved > maximumReserve) {
            revert UtilizationExceeded(newReserved, maximumReserve);
        }

        reservedCollateral = newReserved;
        emit CollateralReserved(amount, newReserved);
    }

    function release(uint256 amount) external onlyRole(OPTION_OPERATOR_ROLE) {
        uint256 reserved = reservedCollateral;
        if (amount > reserved) {
            revert InsufficientReservedCollateral(amount, reserved);
        }

        unchecked {
            reservedCollateral = reserved - amount;
        }
        emit CollateralReleased(amount, reservedCollateral);
    }

    function payout(address receiver, uint256 amount)
        external
        onlyRole(OPTION_OPERATOR_ROLE)
        nonReentrant
    {
        if (receiver == address(0)) revert ZeroAddress();
        uint256 reserved = reservedCollateral;
        if (amount > reserved) {
            revert InsufficientReservedCollateral(amount, reserved);
        }

        unchecked {
            reservedCollateral = reserved - amount;
        }
        IERC20(asset()).safeTransfer(receiver, amount);
        emit OptionPayout(receiver, amount, reservedCollateral);
    }

    function freeLiquidity() public view returns (uint256) {
        return totalAssets() - reservedCollateral;
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        uint256 ownerShares = balanceOf(owner);
        uint256 ownerAssets = previewRedeem(ownerShares);
        uint256 availableAssets = freeLiquidity();

        if (ownerAssets <= availableAssets) return ownerShares;
        return convertToShares(availableAssets);
    }
}

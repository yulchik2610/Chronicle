// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {IOddsIndexOracle} from "./interfaces/IOddsIndexOracle.sol";

/// @title OddsIndexOracle
/// @notice Append-only odds index with auditable source commitments, historical
///         TWAPs and permissionless settlement snapshots.
/// @dev Prices use six-decimal probability precision: 1_000_000 == 100%.
contract OddsIndexOracle is IOddsIndexOracle, AccessControlDefaultAdminRules {
    uint32 public constant PRICE_SCALE = 1_000_000;

    bytes32 public constant PUBLISHER_ROLE = keccak256("PUBLISHER_ROLE");
    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    mapping(bytes32 marketId => MarketConfig config) private _marketConfigs;
    mapping(bytes32 marketId => Observation[] observations) private _observations;
    mapping(bytes32 marketId => mapping(uint64 expiry => Settlement settlement))
        private _settlements;

    error ZeroAddress();
    error InvalidMarketId();
    error InvalidConfiguration();
    error MarketAlreadyRegistered(bytes32 marketId);
    error MarketNotRegistered(bytes32 marketId);
    error MarketNotActive(bytes32 marketId, MarketStatus status);
    error MarketDisputed(bytes32 marketId);
    error MarketAlreadyResolved(bytes32 marketId);
    error InvalidPrice(uint256 price);
    error InvalidTimestamp(uint64 timestamp);
    error NonMonotonicTimestamp(uint64 previousTimestamp, uint64 newTimestamp);
    error InsufficientSources(uint8 supplied, uint8 required);
    error InvalidSourceCommitment();
    error NoObservations(bytes32 marketId);
    error InvalidTimeRange(uint64 startTime, uint64 endTime);
    error InsufficientHistory(bytes32 marketId, uint64 requestedTimestamp);
    error ExpiryNotReached(uint64 expiry);
    error SettlementAlreadyFinalized(bytes32 marketId, uint64 expiry);
    error InvalidResolutionPrice(uint32 price);

    event MarketRegistered(
        bytes32 indexed marketId,
        uint32 maxAge,
        uint32 twapWindow,
        uint8 minSources
    );
    event IndexUpdated(
        bytes32 indexed marketId,
        uint32 price,
        uint64 timestamp,
        uint8 sourceCount,
        bytes32 indexed sourcesHash
    );
    event MarketDisputeFlagged(bytes32 indexed marketId, bytes32 indexed reasonHash);
    event MarketDisputeCleared(bytes32 indexed marketId);
    event MarketResolved(
        bytes32 indexed marketId,
        uint32 finalPrice,
        uint64 resolvedAt,
        bytes32 indexed resolutionHash
    );
    event SettlementFinalized(
        bytes32 indexed marketId,
        uint64 indexed expiry,
        uint32 settlementPrice,
        uint64 finalizedAt
    );

    constructor(
        address initialAdmin,
        address initialPublisher,
        address initialResolver,
        address initialGuardian,
        uint48 adminTransferDelay
    ) AccessControlDefaultAdminRules(adminTransferDelay, initialAdmin) {
        if (
            initialAdmin == address(0) || initialPublisher == address(0)
                || initialResolver == address(0) || initialGuardian == address(0)
        ) {
            revert ZeroAddress();
        }

        _grantRole(PUBLISHER_ROLE, initialPublisher);
        _grantRole(RESOLVER_ROLE, initialResolver);
        _grantRole(GUARDIAN_ROLE, initialGuardian);
    }

    /// @notice Registers immutable oracle parameters for a curated market.
    function registerMarket(
        bytes32 marketId,
        uint32 maxAge,
        uint32 twapWindow,
        uint8 minSources
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (marketId == bytes32(0)) revert InvalidMarketId();
        if (maxAge == 0 || twapWindow == 0 || minSources == 0) {
            revert InvalidConfiguration();
        }
        if (_marketConfigs[marketId].status != MarketStatus.Unregistered) {
            revert MarketAlreadyRegistered(marketId);
        }

        _marketConfigs[marketId] = MarketConfig({
            status: MarketStatus.Active,
            maxAge: maxAge,
            twapWindow: twapWindow,
            minSources: minSources,
            resolvedAt: 0,
            finalPrice: 0
        });

        emit MarketRegistered(marketId, maxAge, twapWindow, minSources);
    }

    /// @notice Appends a publisher-computed multi-source index observation.
    /// @param sourcesHash Commitment to the normalized source payload used off-chain.
    function updateIndex(
        bytes32 marketId,
        uint32 price,
        uint64 timestamp,
        uint8 sourceCount,
        bytes32 sourcesHash
    ) external onlyRole(PUBLISHER_ROLE) {
        MarketConfig storage config = _requireRegistered(marketId);
        if (config.status != MarketStatus.Active) {
            revert MarketNotActive(marketId, config.status);
        }
        if (price > PRICE_SCALE) revert InvalidPrice(price);
        if (timestamp > block.timestamp) revert InvalidTimestamp(timestamp);
        if (sourceCount < config.minSources) {
            revert InsufficientSources(sourceCount, config.minSources);
        }
        if (sourcesHash == bytes32(0)) revert InvalidSourceCommitment();

        _appendObservation(marketId, price, timestamp);
        emit IndexUpdated(marketId, price, timestamp, sourceCount, sourcesHash);
    }

    /// @notice Blocks trading-sensitive reads and new settlements during a dispute.
    function flagDispute(bytes32 marketId, bytes32 reasonHash)
        external
        onlyRole(GUARDIAN_ROLE)
    {
        MarketConfig storage config = _requireRegistered(marketId);
        if (config.status != MarketStatus.Active) {
            revert MarketNotActive(marketId, config.status);
        }
        if (reasonHash == bytes32(0)) revert InvalidSourceCommitment();

        config.status = MarketStatus.Disputed;
        emit MarketDisputeFlagged(marketId, reasonHash);
    }

    /// @notice Restores an unresolved market after governance has cleared a dispute.
    function clearDispute(bytes32 marketId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        MarketConfig storage config = _requireRegistered(marketId);
        if (config.status != MarketStatus.Disputed) {
            revert MarketNotActive(marketId, config.status);
        }

        config.status = MarketStatus.Active;
        emit MarketDisputeCleared(marketId);
    }

    /// @notice Irreversibly resolves a market to 0% or 100% and freezes the index.
    function resolveMarket(
        bytes32 marketId,
        uint32 finalPrice,
        uint64 resolvedAt,
        bytes32 resolutionHash
    ) external onlyRole(RESOLVER_ROLE) {
        MarketConfig storage config = _requireRegistered(marketId);
        if (config.status == MarketStatus.Resolved) {
            revert MarketAlreadyResolved(marketId);
        }
        if (finalPrice != 0 && finalPrice != PRICE_SCALE) {
            revert InvalidResolutionPrice(finalPrice);
        }
        if (resolvedAt > block.timestamp) revert InvalidTimestamp(resolvedAt);
        if (resolutionHash == bytes32(0)) revert InvalidSourceCommitment();

        _appendObservation(marketId, finalPrice, resolvedAt);

        config.status = MarketStatus.Resolved;
        config.resolvedAt = resolvedAt;
        config.finalPrice = finalPrice;

        emit MarketResolved(marketId, finalPrice, resolvedAt, resolutionHash);
    }

    /// @notice Permissionlessly snapshots the deterministic settlement value.
    function finalizeSettlement(bytes32 marketId, uint64 expiry)
        external
        returns (uint32 settlementPrice)
    {
        MarketConfig storage config = _requireRegistered(marketId);
        if (block.timestamp < expiry) revert ExpiryNotReached(expiry);
        if (config.status == MarketStatus.Disputed) revert MarketDisputed(marketId);

        Settlement storage existing = _settlements[marketId][expiry];
        if (existing.finalized) revert SettlementAlreadyFinalized(marketId, expiry);

        if (config.status == MarketStatus.Resolved && expiry >= config.resolvedAt) {
            settlementPrice = config.finalPrice;
        } else {
            if (expiry < config.twapWindow) {
                revert InsufficientHistory(marketId, expiry);
            }
            settlementPrice =
                _getTwap(marketId, expiry - config.twapWindow, expiry, config);
        }

        uint64 finalizedAt = uint64(block.timestamp);
        _settlements[marketId][expiry] = Settlement({
            price: settlementPrice,
            finalizedAt: finalizedAt,
            finalized: true
        });

        emit SettlementFinalized(marketId, expiry, settlementPrice, finalizedAt);
    }

    function getLatestIndex(bytes32 marketId)
        external
        view
        returns (IndexData memory data)
    {
        MarketConfig storage config = _requireRegistered(marketId);
        Observation[] storage observations = _observations[marketId];
        if (observations.length == 0) revert NoObservations(marketId);

        Observation storage latest = observations[observations.length - 1];
        bool stale = config.status == MarketStatus.Disputed
            || (
                config.status != MarketStatus.Resolved
                    && block.timestamp > uint256(latest.timestamp) + config.maxAge
            );

        data = IndexData({
            price: latest.price,
            timestamp: latest.timestamp,
            isStale: stale,
            status: config.status
        });
    }

    function getTwap(bytes32 marketId, uint64 startTime, uint64 endTime)
        external
        view
        returns (uint32)
    {
        MarketConfig storage config = _requireRegistered(marketId);
        if (config.status == MarketStatus.Disputed) revert MarketDisputed(marketId);
        return _getTwap(marketId, startTime, endTime, config);
    }

    function getSettlementPrice(bytes32 marketId, uint64 expiry)
        external
        view
        returns (Settlement memory)
    {
        _requireRegistered(marketId);
        return _settlements[marketId][expiry];
    }

    function marketConfig(bytes32 marketId)
        external
        view
        returns (MarketConfig memory)
    {
        return _requireRegistered(marketId);
    }

    function observationCount(bytes32 marketId) external view returns (uint256) {
        _requireRegistered(marketId);
        return _observations[marketId].length;
    }

    function observationAt(bytes32 marketId, uint256 index)
        external
        view
        returns (Observation memory)
    {
        _requireRegistered(marketId);
        return _observations[marketId][index];
    }

    function _appendObservation(bytes32 marketId, uint32 price, uint64 timestamp) private {
        Observation[] storage observations = _observations[marketId];
        uint160 cumulativePrice;

        if (observations.length != 0) {
            Observation storage previous = observations[observations.length - 1];
            if (timestamp <= previous.timestamp) {
                revert NonMonotonicTimestamp(previous.timestamp, timestamp);
            }

            cumulativePrice = previous.cumulativePrice
                + uint160(uint256(previous.price) * (timestamp - previous.timestamp));
        }

        observations.push(
            Observation({
                timestamp: timestamp,
                price: price,
                cumulativePrice: cumulativePrice
            })
        );
    }

    function _getTwap(
        bytes32 marketId,
        uint64 startTime,
        uint64 endTime,
        MarketConfig storage config
    ) private view returns (uint32) {
        if (startTime >= endTime || endTime > block.timestamp) {
            revert InvalidTimeRange(startTime, endTime);
        }

        Observation[] storage observations = _observations[marketId];
        if (observations.length == 0) revert NoObservations(marketId);
        if (startTime < observations[0].timestamp) {
            revert InsufficientHistory(marketId, startTime);
        }

        Observation storage latest = observations[observations.length - 1];
        if (config.status != MarketStatus.Resolved && endTime > latest.timestamp) {
            revert InsufficientHistory(marketId, endTime);
        }

        uint256 cumulativeStart = _cumulativeAt(observations, startTime);
        uint256 cumulativeEnd = _cumulativeAt(observations, endTime);
        return uint32((cumulativeEnd - cumulativeStart) / (endTime - startTime));
    }

    function _cumulativeAt(Observation[] storage observations, uint64 timestamp)
        private
        view
        returns (uint256)
    {
        uint256 low;
        uint256 high = observations.length;

        // Upper-bound search: first observation with timestamp > requested timestamp.
        while (low < high) {
            uint256 mid = (low + high) >> 1;
            if (observations[mid].timestamp <= timestamp) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }

        Observation storage base = observations[low - 1];
        return uint256(base.cumulativePrice)
            + uint256(base.price) * (timestamp - base.timestamp);
    }

    function _requireRegistered(bytes32 marketId)
        private
        view
        returns (MarketConfig storage config)
    {
        config = _marketConfigs[marketId];
        if (config.status == MarketStatus.Unregistered) {
            revert MarketNotRegistered(marketId);
        }
    }
}

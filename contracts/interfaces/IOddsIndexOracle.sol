// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IOddsIndexOracle
/// @notice Read-only interface shared by Binary Odds Options and Odds Perpetuals.
interface IOddsIndexOracle {
    enum MarketStatus {
        Unregistered,
        Active,
        Disputed,
        Resolved
    }

    struct IndexData {
        uint32 price;
        uint64 timestamp;
        bool isStale;
        MarketStatus status;
    }

    struct MarketConfig {
        MarketStatus status;
        uint32 maxAge;
        uint32 twapWindow;
        uint8 minSources;
        uint16 maxDeviationBps;
        uint32 deviationWindow;
        uint64 resolvedAt;
        uint32 finalPrice;
    }

    struct Observation {
        uint64 timestamp;
        uint32 price;
        uint160 cumulativePrice;
    }

    struct Settlement {
        uint32 price;
        uint64 finalizedAt;
        bool finalized;
    }

    /// @notice Price precision. 1_000_000 represents 100%.
    function PRICE_SCALE() external view returns (uint32);

    function getLatestIndex(bytes32 marketId) external view returns (IndexData memory);

    function getTwap(bytes32 marketId, uint64 startTime, uint64 endTime)
        external
        view
        returns (uint32);

    function getSettlementPrice(bytes32 marketId, uint64 expiry)
        external
        view
        returns (Settlement memory);

    function marketConfig(bytes32 marketId) external view returns (MarketConfig memory);

    function observationCount(bytes32 marketId) external view returns (uint256);

    function observationAt(bytes32 marketId, uint256 index)
        external
        view
        returns (Observation memory);
}

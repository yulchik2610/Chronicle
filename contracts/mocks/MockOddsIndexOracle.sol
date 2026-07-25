// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IOddsIndexOracle} from "../interfaces/IOddsIndexOracle.sol";

/// @notice Mutable test double for downstream option and perpetual contracts.
contract MockOddsIndexOracle is IOddsIndexOracle {
    uint32 public constant PRICE_SCALE = 1_000_000;

    mapping(bytes32 marketId => IndexData data) private _latest;
    mapping(bytes32 marketId => MarketConfig config) private _configs;
    mapping(bytes32 key => uint32 price) private _twaps;
    mapping(bytes32 marketId => mapping(uint64 expiry => Settlement settlement))
        private _settlements;

    function setLatest(bytes32 marketId, IndexData calldata data) external {
        _latest[marketId] = data;
    }

    function setMarketConfig(bytes32 marketId, MarketConfig calldata config) external {
        _configs[marketId] = config;
    }

    function setTwap(bytes32 marketId, uint64 startTime, uint64 endTime, uint32 price)
        external
    {
        _twaps[keccak256(abi.encode(marketId, startTime, endTime))] = price;
    }

    function setSettlement(bytes32 marketId, uint64 expiry, uint32 price) external {
        _settlements[marketId][expiry] =
            Settlement({price: price, finalizedAt: uint64(block.timestamp), finalized: true});
    }

    function getLatestIndex(bytes32 marketId)
        external
        view
        returns (IndexData memory)
    {
        return _latest[marketId];
    }

    function getTwap(bytes32 marketId, uint64 startTime, uint64 endTime)
        external
        view
        returns (uint32)
    {
        return _twaps[keccak256(abi.encode(marketId, startTime, endTime))];
    }

    function getSettlementPrice(bytes32 marketId, uint64 expiry)
        external
        view
        returns (Settlement memory)
    {
        return _settlements[marketId][expiry];
    }

    function marketConfig(bytes32 marketId)
        external
        view
        returns (MarketConfig memory)
    {
        return _configs[marketId];
    }

    function observationCount(bytes32) external pure returns (uint256) {
        return 0;
    }

    function observationAt(bytes32, uint256)
        external
        pure
        returns (Observation memory)
    {
        return Observation({timestamp: 0, price: 0, cumulativePrice: 0});
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import { BoardBeacon } from "./BoardBeacon.sol";

/// @title LeaderboardBeacon
/// @notice BoardBeacon for lump-sum (pay-per-message) boards. These hold no funds between calls, so
///         every entry point may be pausable.
contract LeaderboardBeacon is BoardBeacon {
    constructor(
        address _implementation,
        address _admin,
        address _guardian,
        uint256 _upgradeDelay,
        bytes4[] memory _pausableSelectors
    ) BoardBeacon(_admin, _guardian, _upgradeDelay) {
        _install(_implementation, _pausableSelectors);
    }
}

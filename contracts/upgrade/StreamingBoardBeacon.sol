// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import { ISuperfluid, ISuperToken, ISuperApp } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import { BoardBeacon } from "./BoardBeacon.sol";
import { ISuperAppWiring } from "../streaming/interfaces/IStreamingLeaderboard.sol";

interface IStreamingExits {
    function withdrawDeposit() external;
}

/// @title StreamingBoardBeacon
/// @notice BoardBeacon for streaming boards. Rejects implementations wired to another host or SuperToken
///         (every live board would break on its next callback), and refuses to make the exits pausable:
///         a reverting termination callback jails the SuperApp, and deposits must always be withdrawable.
contract StreamingBoardBeacon is BoardBeacon {
    ISuperfluid public immutable HOST;
    ISuperToken public immutable ETHX;

    error ImplementationHostMismatch();
    error ImplementationTokenMismatch();

    constructor(
        ISuperfluid _host,
        ISuperToken _ethx,
        address _implementation,
        address _admin,
        address _guardian,
        uint256 _upgradeDelay,
        bytes4[] memory _pausableSelectors
    ) BoardBeacon(_admin, _guardian, _upgradeDelay) {
        HOST = _host;
        ETHX = _ethx;
        _install(_implementation, _pausableSelectors);
    }

    function _validateImplementation(address _implementation) internal view override {
        super._validateImplementation(_implementation);
        if (ISuperAppWiring(_implementation).HOST() != HOST) revert ImplementationHostMismatch();
        if (!ISuperAppWiring(_implementation).isAcceptedSuperToken(ETHX)) revert ImplementationTokenMismatch();
    }

    function _assertPausable(bytes4 _selector) internal pure override {
        if (
            _selector == ISuperApp.beforeAgreementTerminated.selector
                || _selector == ISuperApp.afterAgreementTerminated.selector
                || _selector == IStreamingExits.withdrawDeposit.selector
        ) revert SelectorNotPausable(_selector);
    }
}

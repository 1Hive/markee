// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

interface IBoardRouter {
    function route(bytes4 selector) external view returns (address);
}

/// @title BeaconForwarder
/// @notice Installed as a factory's leaderboardImplementation, so every EIP-1167 board clone delegates
///         here and from here to whatever implementation the beacon currently routes to. This keeps
///         existing factories (and the streaming factory's Superfluid registration grant) unchanged
///         while making every board they create upgradeable and pausable.
/// @dev Holds no storage and exposes one function, boardBeacon(), which every board then answers
///      itself. Board implementations must not define a function with that selector.
/// @dev Called directly rather than through a clone, it answers as the current implementation would
///      but through a staticcall, so a factory's implementation probes still pass while nobody can
///      initialize the forwarder's own storage as a board.
contract BeaconForwarder {
    IBoardRouter private immutable BEACON;
    address private immutable SELF;
    bool private immutable ACCEPTS_PLAIN_ETH;

    error ZeroBeacon();

    /// @param _acceptsPlainEth Accept ETH sent with empty calldata without consulting the beacon. Streaming
    ///        boards need it because ETHx.downgradeToETH pays them with a 2300-gas stipend, too little for a
    ///        beacon lookup. Their implementation's receive is a no-op, so nothing is skipped.
    constructor(IBoardRouter _beacon, bool _acceptsPlainEth) {
        if (address(_beacon) == address(0)) revert ZeroBeacon();
        BEACON = _beacon;
        SELF = address(this);
        ACCEPTS_PLAIN_ETH = _acceptsPlainEth;
    }

    function boardBeacon() external view returns (address) {
        return address(BEACON);
    }

    receive() external payable {
        if (!ACCEPTS_PLAIN_ETH) _forward();
    }

    fallback() external payable {
        _forward();
    }

    function _forward() private {
        address impl = BEACON.route(msg.sig);
        bool direct = address(this) == SELF;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let ok := 0
            switch direct
            case 0 { ok := delegatecall(gas(), impl, 0, calldatasize(), 0, 0) }
            default { ok := staticcall(gas(), impl, 0, calldatasize(), 0, 0) }
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}

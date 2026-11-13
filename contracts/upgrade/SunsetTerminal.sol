// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

/// @title SunsetTerminal
/// @notice Set as a legacy lump-sum factory's revNetTerminal (with revNetEnabled true) once its boards are
///         migrated: every board on that factory reads the terminal at pay time, so new payments
///         revert with the successor-lookup hint instead of landing on a board nobody maintains.
/// @dev A board with a zero beneficiary never reaches the terminal, so it is not frozen by this.
contract SunsetTerminal {
    address public immutable MIGRATOR;

    error BoardSunset(address migrator);

    constructor(address _migrator) {
        MIGRATOR = _migrator;
    }

    function pay(uint256, address, uint256, address, uint256, string calldata, bytes calldata)
        external
        payable
        returns (uint256)
    {
        revert BoardSunset(MIGRATOR);
    }
}

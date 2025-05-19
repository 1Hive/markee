// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity ^0.8.19;

interface IPricingModule {
    function getCurrentPrice(address marquee) external view returns (uint256);
    function updatePrice(address marquee, uint256 newAmount) external;
    function initializePrice(address marquee, uint256 initialPrice) external;
}

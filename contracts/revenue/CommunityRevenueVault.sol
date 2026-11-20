// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IRevenueETHx, IRevenueWETH} from "./RevenueTypes.sol";

/// @notice Deterministic beneficiary of a community's Markee leaderboard.
/// @dev Derived from Gardens' CommunityRevenueVault, with platform-neutral identity.
contract CommunityRevenueVault is ReentrancyGuard {
    address public router;
    bytes32 public communityKey;
    IRevenueETHx public ethx;
    IRevenueWETH public weth;

    error Unauthorized();
    error InvalidConfiguration();
    error InvalidAmount();
    error TransferFailed();
    event RevenueReleased(bytes32 indexed communityKey, uint256 ethxUnwrapped, uint256 wethUnwrapped, uint256 amount);

    constructor() {
        router = address(1);
    }

    function initialize(bytes32 key, address ethx_, address weth_) external {
        if (router != address(0)) revert Unauthorized();
        if (ethx_.code.length == 0 || weth_.code.length == 0 || ethx_ == weth_) revert InvalidConfiguration();
        router = msg.sender;
        communityKey = key;
        ethx = IRevenueETHx(ethx_);
        weth = IRevenueWETH(weth_);
    }

    receive() external payable {}

    function availableRevenue() public view returns (uint256) {
        return address(this).balance + ethx.balanceOf(address(this)) + weth.balanceOf(address(this));
    }

    /// @notice Release an exact quoted amount. Streaming growth and excess
    /// revenue remain in the vault, so a quote is not invalidated by accrual.
    function releaseRevenue(uint256 amount) external nonReentrant {
        if (msg.sender != router) revert Unauthorized();
        if (amount == 0 || amount > availableRevenue()) revert InvalidAmount();
        uint256 x = ethx.balanceOf(address(this));
        uint256 w = weth.balanceOf(address(this));
        if (x != 0) ethx.downgradeToETH(x);
        if (w != 0) weth.withdraw(w);
        (bool success,) = payable(router).call{value: amount}("");
        if (!success) revert TransferFailed();
        emit RevenueReleased(communityKey, x, w, amount);
    }
}

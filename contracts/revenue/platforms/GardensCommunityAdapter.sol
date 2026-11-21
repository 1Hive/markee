// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {RevenueUpgradeable} from "../RevenueUpgradeable.sol";

interface IGardensCouncil {
    function councilSafe() external view returns (address);
}

/// @notice Gardens' entire delivery strategy: read the current council Safe and
/// transfer the received asset. No cached Safe or mutable community mapping.
contract GardensCommunityAdapter is RevenueUpgradeable {
    address public receiver;
    uint256[49] private __gap;
    event CommunityRevenueDelivered(
        bytes32 indexed payoutId, address indexed community, address indexed councilSafe, address token, uint256 amount
    );

    function initialize(address owner_, address receiver_) external initializer {
        if (receiver_.code.length == 0) revert InvalidConfiguration();
        _initializeOwner(owner_);
        receiver = receiver_;
    }

    function transferToCommunity(bytes32 communityId, bytes32 payoutId, address token, uint256 amount)
        external
        payable
        nonReentrant
    {
        if (msg.sender != receiver) revert Unauthorized();
        if (uint256(communityId) >> 160 != 0 || amount == 0) revert InvalidConfiguration();
        address community = address(uint160(uint256(communityId)));
        address safe = IGardensCouncil(community).councilSafe();
        if (safe == address(0) || safe == address(this) || safe == receiver) revert InvalidConfiguration();
        if (token == address(0)) {
            if (msg.value != amount) revert InvalidAmount();
            (bool success,) = payable(safe).call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            if (msg.value != 0) revert InvalidAmount();
            SafeERC20.safeTransferFrom(IERC20(token), receiver, safe, amount);
        }
        emit CommunityRevenueDelivered(payoutId, community, safe, token, amount);
    }
}

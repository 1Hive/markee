// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {RevenueUpgradeable} from "../RevenueUpgradeable.sol";

/// @notice Prototype seam for Giveth's offchain Project data. Not production deployable.
/// A production implementation must authenticate, refresh and expire this data.
interface IGivethProjectData {
    function activeRecipient(uint256 projectId) external view returns (address);
}

contract GivethProjectAdapterPrototype is RevenueUpgradeable {
    address public receiver;
    IGivethProjectData public projectData;
    uint256[48] private __gap;

    event ProjectRevenueDelivered(
        bytes32 indexed payoutId, uint256 indexed projectId, address recipient, uint256 amount
    );

    function initialize(address owner_, address receiver_, address projectData_) external initializer {
        if (receiver_.code.length == 0 || projectData_.code.length == 0) revert InvalidConfiguration();
        _initializeOwner(owner_);
        receiver = receiver_;
        projectData = IGivethProjectData(projectData_);
    }

    function transferToCommunity(bytes32 communityId, bytes32 payoutId, address token, uint256 amount)
        external
        payable
        nonReentrant
    {
        if (msg.sender != receiver) revert Unauthorized();
        if (uint256(communityId) == 0 || token != address(0) || amount == 0 || msg.value != amount) {
            revert InvalidAmount();
        }
        address recipient = projectData.activeRecipient(uint256(communityId));
        if (recipient == address(0) || recipient == receiver || recipient == address(this)) {
            revert InvalidConfiguration();
        }
        (bool sent,) = payable(recipient).call{value: amount}("");
        if (!sent) revert TransferFailed();
        emit ProjectRevenueDelivered(payoutId, uint256(communityId), recipient, amount);
    }
}

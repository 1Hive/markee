// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {RevenueUpgradeable} from "../RevenueUpgradeable.sol";

interface IRevenueJBDirectory {
    function primaryTerminalOf(uint256 projectId, address token) external view returns (address);
    function isTerminalOf(uint256 projectId, address terminal) external view returns (bool);
}

interface IRevenueJBTerminal {
    function addToBalanceOf(
        uint256 projectId,
        address token,
        uint256 amount,
        bool shouldReturnHeldFees,
        string calldata memo,
        bytes calldata metadata
    ) external payable;
}

contract RevnetCommunityAdapter is RevenueUpgradeable {
    address public constant NATIVE_TOKEN = address(0x000000000000000000000000000000000000EEEe);
    address public receiver;
    IRevenueJBDirectory public directory;
    uint256[48] private __gap;
    event RevnetBalanceAdded(
        bytes32 indexed payoutId, uint256 indexed projectId, address indexed terminal, uint256 amount
    );

    function initialize(address owner_, address receiver_, address directory_) external initializer {
        if (receiver_.code.length == 0 || directory_.code.length == 0) revert InvalidConfiguration();
        _initializeOwner(owner_);
        receiver = receiver_;
        directory = IRevenueJBDirectory(directory_);
    }

    function transferToCommunity(bytes32 communityId, bytes32 payoutId, address token, uint256 amount)
        external
        payable
        nonReentrant
    {
        if (msg.sender != receiver) revert Unauthorized();
        uint256 projectId = uint256(communityId);
        if (projectId == 0 || token != address(0) || amount == 0 || msg.value != amount) revert InvalidAmount();
        address terminal = directory.primaryTerminalOf(projectId, NATIVE_TOKEN);
        if (terminal.code.length == 0 || !directory.isTerminalOf(projectId, terminal)) revert InvalidConfiguration();
        IRevenueJBTerminal(terminal).addToBalanceOf{value: amount}(
            projectId, NATIVE_TOKEN, amount, false, "Markee community revenue", ""
        );
        emit RevnetBalanceAdded(payoutId, projectId, terminal, amount);
    }
}

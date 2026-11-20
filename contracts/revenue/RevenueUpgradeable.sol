// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.23;

import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev OZ 5.6 ReentrancyGuard uses a namespaced slot and accepts a zero initial
/// slot as unlocked, making it safe for proxies and clones. UUPS is stateless.
abstract contract RevenueUpgradeable is Ownable2StepUpgradeable, UUPSUpgradeable, ReentrancyGuard {
    error InvalidConfiguration();
    error Unauthorized();
    error InvalidAmount();
    error TransferFailed();

    constructor() {
        _disableInitializers();
    }

    function _initializeOwner(address initialOwner) internal onlyInitializing {
        __Ownable_init(initialOwner);
        __Ownable2Step_init();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// @dev Revenue escrow must always retain an operational recovery authority.
    function renounceOwnership() public pure override {
        revert Unauthorized();
    }
}

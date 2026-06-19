// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import { ISuperfluid, ISuperToken, ISuperApp } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import { StreamingLeaderboard } from "./StreamingLeaderboard.sol";
import { Markee } from "../Markee.sol";
import { ILeaderboardFactory } from "../Interfaces.sol";

/// @title StreamingLeaderboardFactory (Option B)
/// @notice Platform-level factory for the streaming pricing strategy. Mirrors v1.3 LeaderboardFactory
///         (deploys both implementations in its constructor, holds factory-level RevNet/fee config read
///         by every clone at settle-time), and additionally acts as the SuperApp registrar: it
///         registers each cloned StreamingLeaderboard with the Superfluid host so callbacks fire.
///
/// @dev On the permissioned Base host, the host gates registerApp() by the *caller* (this factory).
///      Superfluid governance authorizes this factory once via
///      `gov.setAppRegistrationKey(host, factory, "k1", farFutureTs)`, one authorization covers
///      unlimited deploys. (Fork tests replicate this by impersonating the governance owner.)
contract StreamingLeaderboardFactory is ILeaderboardFactory {

    // ─── Superfluid wiring ────────────────────────────────────────────────────
    ISuperfluid public immutable HOST;
    ISuperToken public immutable ETHX;

    // ─── Implementations (deployed in constructor) ────────────────────────────
    address public immutable leaderboardImplementation;
    address public immutable markeeImplementation;

    // ─── Platform config ──────────────────────────────────────────────────────
    string public platformName;
    string public platformId;

    // ─── RevNet + fee config, factory admin (Coop multisig) only ─────────────
    address public override revNetTerminal;
    uint256 public override revNetProjectId;
    bool public override revNetEnabled;
    uint256 public override percentToBeneficiary;
    address public override platformFeeReceiver;
    uint256 public override percentToPlatformFeeReceiver;

    // ─── Defaults for new leaderboards ────────────────────────────────────────
    uint256 public defaultMinimumMonthlyRate;
    uint256 public defaultMaxMessageLength;
    uint256 public defaultMaxNameLength;

    address public factoryAdmin;

    // ─── Registry ─────────────────────────────────────────────────────────────
    address[] public leaderboards;
    mapping(address => bool) public isFactoryLeaderboard;

    // ─── Events ───────────────────────────────────────────────────────────────
    event LeaderboardCreated(
        address indexed leaderboardAddress,
        address indexed admin,
        address indexed beneficiaryAddress,
        string name,
        address seedMarkeeAddress
    );
    event FactoryAdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event RevNetEnabledChanged(bool oldEnabled, bool newEnabled);
    event PercentToBeneficiaryChanged(uint256 oldPercent, uint256 newPercent);
    event RevNetTerminalChanged(address indexed oldTerminal, address indexed newTerminal);
    event RevNetProjectIdChanged(uint256 oldId, uint256 newId);
    event PlatformFeeReceiverChanged(address indexed oldReceiver, address indexed newReceiver);
    event PercentToPlatformFeeReceiverChanged(uint256 oldPercent, uint256 newPercent);
    event DefaultMinimumMonthlyRateChanged(uint256 oldRate, uint256 newRate);
    event DefaultMaxMessageLengthChanged(uint256 oldLength, uint256 newLength);
    event DefaultMaxNameLengthChanged(uint256 oldLength, uint256 newLength);

    modifier onlyFactoryAdmin() {
        require(msg.sender == factoryAdmin, "Only factory admin");
        _;
    }

    constructor(
        string memory _platformName,
        string memory _platformId,
        ISuperfluid _host,
        ISuperToken _ethx,
        address _revNetTerminal,
        uint256 _revNetProjectId,
        address _platformFeeReceiver,
        address _factoryAdmin
    ) {
        require(bytes(_platformName).length > 0, "Platform name cannot be empty");
        require(bytes(_platformId).length > 0, "Platform ID cannot be empty");
        require(address(_host) != address(0), "Host cannot be zero address");
        require(address(_ethx) != address(0), "ETHx cannot be zero address");
        require(_revNetTerminal != address(0), "RevNet terminal cannot be zero address");
        require(_revNetProjectId > 0, "RevNet project ID cannot be zero");
        require(_factoryAdmin != address(0), "Factory admin cannot be zero address");

        HOST = _host;
        ETHX = _ethx;

        leaderboardImplementation = address(new StreamingLeaderboard(_host, _ethx));
        markeeImplementation = address(new Markee());

        platformName = _platformName;
        platformId = _platformId;
        revNetTerminal = _revNetTerminal;
        revNetProjectId = _revNetProjectId;
        revNetEnabled = true;
        percentToBeneficiary = 6200;
        platformFeeReceiver = _platformFeeReceiver;
        percentToPlatformFeeReceiver = 3800;
        factoryAdmin = _factoryAdmin;
        defaultMinimumMonthlyRate = 0.001 ether;
        defaultMaxMessageLength = 222;
        defaultMaxNameLength = 22;
    }

    // ─── Leaderboard creation ─────────────────────────────────────────────────

    function createLeaderboard(address _beneficiaryAddress, string calldata _leaderboardName)
        external
        returns (address leaderboardAddress, address seedMarkeeAddress)
    {
        require(bytes(_leaderboardName).length > 0, "Name cannot be empty");

        leaderboardAddress = _clone(leaderboardImplementation);

        seedMarkeeAddress = StreamingLeaderboard(payable(leaderboardAddress)).initialize(
            msg.sender,
            _beneficiaryAddress,
            _leaderboardName,
            markeeImplementation,
            defaultMinimumMonthlyRate,
            defaultMaxMessageLength,
            defaultMaxNameLength,
            msg.sender
        );

        // Register the clone as a SuperApp so CFA callbacks fire (created/updated/deleted).
        uint256 configWord = StreamingLeaderboard(payable(leaderboardAddress)).getConfigWord(true, true, true);
        HOST.registerApp(ISuperApp(leaderboardAddress), configWord);

        leaderboards.push(leaderboardAddress);
        isFactoryLeaderboard[leaderboardAddress] = true;

        emit LeaderboardCreated(
            leaderboardAddress, msg.sender, _beneficiaryAddress, _leaderboardName, seedMarkeeAddress
        );
    }

    // ─── Registry queries ─────────────────────────────────────────────────────

    function leaderboardCount() external view returns (uint256) {
        return leaderboards.length;
    }

    function getLeaderboards(uint256 offset, uint256 limit) external view returns (address[] memory result) {
        if (offset >= leaderboards.length) return new address[](0);
        uint256 end = offset + limit;
        if (end > leaderboards.length) end = leaderboards.length;
        result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = leaderboards[i];
        }
    }

    // ─── Factory admin setters ────────────────────────────────────────────────

    function setRevNetEnabled(bool _enabled) external onlyFactoryAdmin {
        emit RevNetEnabledChanged(revNetEnabled, _enabled);
        revNetEnabled = _enabled;
    }

    function setPercentToBeneficiary(uint256 _newPercent) external onlyFactoryAdmin {
        require(_newPercent <= 10000, "Cannot exceed 100%");
        emit PercentToBeneficiaryChanged(percentToBeneficiary, _newPercent);
        percentToBeneficiary = _newPercent;
    }

    function setRevNetTerminal(address _newTerminal) external onlyFactoryAdmin {
        require(_newTerminal != address(0), "Terminal cannot be zero address");
        emit RevNetTerminalChanged(revNetTerminal, _newTerminal);
        revNetTerminal = _newTerminal;
    }

    function setRevNetProjectId(uint256 _newProjectId) external onlyFactoryAdmin {
        require(_newProjectId > 0, "Project ID cannot be zero");
        emit RevNetProjectIdChanged(revNetProjectId, _newProjectId);
        revNetProjectId = _newProjectId;
    }

    function setPlatformFeeReceiver(address _newReceiver) external onlyFactoryAdmin {
        emit PlatformFeeReceiverChanged(platformFeeReceiver, _newReceiver);
        platformFeeReceiver = _newReceiver;
    }

    function setPercentToPlatformFeeReceiver(uint256 _newPercent) external onlyFactoryAdmin {
        require(_newPercent <= 10000, "Cannot exceed 100%");
        emit PercentToPlatformFeeReceiverChanged(percentToPlatformFeeReceiver, _newPercent);
        percentToPlatformFeeReceiver = _newPercent;
    }

    function setFactoryAdmin(address _newAdmin) external onlyFactoryAdmin {
        require(_newAdmin != address(0), "Admin cannot be zero address");
        emit FactoryAdminChanged(factoryAdmin, _newAdmin);
        factoryAdmin = _newAdmin;
    }

    function setDefaultMinimumMonthlyRate(uint256 _newRate) external onlyFactoryAdmin {
        emit DefaultMinimumMonthlyRateChanged(defaultMinimumMonthlyRate, _newRate);
        defaultMinimumMonthlyRate = _newRate;
    }

    function setDefaultMaxMessageLength(uint256 _newLength) external onlyFactoryAdmin {
        require(_newLength > 0, "Must be > 0");
        emit DefaultMaxMessageLengthChanged(defaultMaxMessageLength, _newLength);
        defaultMaxMessageLength = _newLength;
    }

    function setDefaultMaxNameLength(uint256 _newLength) external onlyFactoryAdmin {
        require(_newLength > 0, "Must be > 0");
        emit DefaultMaxNameLengthChanged(defaultMaxNameLength, _newLength);
        defaultMaxNameLength = _newLength;
    }

    // ─── EIP-1167 minimal proxy ───────────────────────────────────────────────

    function _clone(address implementation) internal returns (address instance) {
        assembly {
            mstore(0x00, or(
                shr(0xe8, shl(0x60, implementation)),
                0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000
            ))
            mstore(0x20, or(
                shl(0x78, implementation),
                0x5af43d82803e903d91602b57fd5bf3
            ))
            instance := create(0, 0x09, 0x37)
        }
        require(instance != address(0), "Clone deployment failed");
    }
}

// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.23;

import { ISuperfluid, ISuperToken, ISuperApp } from
    "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import { IStreamingLeaderboard, ISuperAppWiring, IMarkeeImplementation } from
    "./interfaces/IStreamingLeaderboard.sol";
import { ILeaderboardFactory } from "./interfaces/ILeaderboardFactory.sol";

/// @title StreamingLeaderboardFactory (Option B)
/// @notice Single factory for the streaming pricing strategy, serving every platform: each board is
///         tagged with its platform at creation (boardPlatform: name + id). Holds the factory-level
///         RevNet/fee config every clone reads at settle-time, and acts as the SuperApp registrar: it
///         registers each cloned StreamingLeaderboard with the Superfluid host so callbacks fire.
/// @dev This contract outlives board and Markee versions: it takes both implementations as addresses
///      and compiles against interfaces alone, so a new board version ships through setImplementations
///      instead of a new factory. A board version it accepts must satisfy IStreamingLeaderboard (that
///      exact 8-argument initialize) and expose ISuperAppWiring wired to this same host and SuperToken,
///      which the constructor and setImplementations both check. It never calls a Markee, it only hands
///      markeeImplementation to each board at initialize.
///
/// @dev On the permissioned Base host, the host gates registerApp() by the *caller* (this factory).
///      Superfluid governance authorizes this factory once via
///      `gov.setAppRegistrationKey(host, factory, "k1", farFutureTs)`, one authorization covers
///      unlimited deploys. (Fork tests replicate this by impersonating the governance owner.)
contract StreamingLeaderboardFactory is ILeaderboardFactory {

    // ─── Superfluid wiring ────────────────────────────────────────────────────
    ISuperfluid public immutable HOST;
    ISuperToken public immutable ETHX;

    // ─── Implementations (supplied at construction, swappable by the admin) ───
    address public leaderboardImplementation;
    address public markeeImplementation;

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
    /// @dev 31 keeps each tag within Solidity's single-slot short-string layout.
    uint256 public constant MAX_PLATFORM_TAG_LENGTH = 31;

    struct Platform {
        string name;
        string id;
    }

    address[] public leaderboards;
    mapping(address => bool) public isFactoryLeaderboard;
    /// @dev The auto-getter returns an unnamed (name, id) tuple; indexers should prefer the
    ///      LeaderboardPlatformAssigned event, whose fields are named. Latest event wins.
    mapping(address => Platform) public boardPlatform;

    // ─── Events ───────────────────────────────────────────────────────────────
    event LeaderboardCreated(
        address indexed leaderboardAddress,
        address indexed admin,
        address indexed beneficiaryAddress,
        string name,
        address seedMarkeeAddress
    );
    event LeaderboardPlatformAssigned(address indexed leaderboardAddress, string platformName, string platformId);
    event LeaderboardImplementationChanged(address indexed oldImplementation, address indexed newImplementation);
    event MarkeeImplementationChanged(address indexed oldImplementation, address indexed newImplementation);
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

    // ─── Custom errors (smaller bytecode than require strings) ────────────────
    error OnlyFactoryAdmin();
    error NotFactoryLeaderboard();
    error EmptyPlatformName();
    error EmptyPlatformId();
    error PlatformTagTooLong();
    error ZeroHost();
    error ZeroETHx();
    error ZeroRevNetTerminal();
    error ZeroRevNetProjectId();
    error ZeroFactoryAdmin();
    error ImplementationNotContract();
    error ImplementationHostMismatch();
    error ImplementationTokenMismatch();
    error MarkeeImplementationNotLocked();
    error EmptyName();
    error PercentTooHigh();
    error ZeroMaxMessageLength();
    error ZeroMaxNameLength();
    error CloneFailed();

    modifier onlyFactoryAdmin() {
        if (msg.sender != factoryAdmin) revert OnlyFactoryAdmin();
        _;
    }

    constructor(
        ISuperfluid _host,
        ISuperToken _ethx,
        address _leaderboardImplementation,
        address _markeeImplementation,
        address _revNetTerminal,
        uint256 _revNetProjectId,
        address _platformFeeReceiver,
        address _factoryAdmin
    ) {
        if (address(_host) == address(0)) revert ZeroHost();
        if (address(_ethx) == address(0)) revert ZeroETHx();
        if (_revNetTerminal == address(0)) revert ZeroRevNetTerminal();
        if (_revNetProjectId == 0) revert ZeroRevNetProjectId();
        if (_factoryAdmin == address(0)) revert ZeroFactoryAdmin();

        HOST = _host;
        ETHX = _ethx;

        _setImplementations(_leaderboardImplementation, _markeeImplementation);

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

    /// @notice Creates a board tagged with an explicit platform, recorded on-chain
    ///         (boardPlatform + LeaderboardPlatformAssigned) as a free-form grouping tag.
    ///         Curation of which boards belong to a platform is handled off-chain.
    function createLeaderboard(
        address _beneficiaryAddress,
        string calldata _leaderboardName,
        string calldata _platformName,
        string calldata _platformId
    ) external returns (address leaderboardAddress, address seedMarkeeAddress) {
        if (bytes(_leaderboardName).length == 0) revert EmptyName();
        _validatePlatformTags(_platformName, _platformId);

        leaderboardAddress = _clone(leaderboardImplementation);

        seedMarkeeAddress = IStreamingLeaderboard(leaderboardAddress).initialize(
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
        uint256 configWord = ISuperAppWiring(leaderboardAddress).getConfigWord(true, true, true);
        HOST.registerApp(ISuperApp(leaderboardAddress), configWord);

        leaderboards.push(leaderboardAddress);
        isFactoryLeaderboard[leaderboardAddress] = true;
        boardPlatform[leaderboardAddress] = Platform({ name: _platformName, id: _platformId });

        emit LeaderboardCreated(
            leaderboardAddress, msg.sender, _beneficiaryAddress, _leaderboardName, seedMarkeeAddress
        );
        emit LeaderboardPlatformAssigned(leaderboardAddress, _platformName, _platformId);
    }

    // ─── Registry queries ─────────────────────────────────────────────────────

    function leaderboardCount() external view returns (uint256) {
        return leaderboards.length;
    }

    function getLeaderboards(uint256 offset, uint256 limit) external view returns (address[] memory result) {
        if (offset >= leaderboards.length) return new address[](0);
        uint256 end;
        // Clamp before adding, so a limit meaning "the rest" returns the tail instead of panicking on
        // offset + limit. Unchecked is safe: offset < length above, and the sum is only formed when
        // limit keeps it below length.
        unchecked {
            uint256 remaining = leaderboards.length - offset;
            end = limit < remaining ? offset + limit : leaderboards.length;
        }
        result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = leaderboards[i];
        }
    }

    // ─── Factory admin setters ────────────────────────────────────────────────

    /// @notice Corrects a board's platform tags after creation (typo fix, platform rebrand).
    ///         Re-emits LeaderboardPlatformAssigned; indexers treat the latest event as current.
    function setBoardPlatform(address _leaderboard, string calldata _platformName, string calldata _platformId)
        external
        onlyFactoryAdmin
    {
        if (!isFactoryLeaderboard[_leaderboard]) revert NotFactoryLeaderboard();
        _validatePlatformTags(_platformName, _platformId);
        boardPlatform[_leaderboard] = Platform({ name: _platformName, id: _platformId });
        emit LeaderboardPlatformAssigned(_leaderboard, _platformName, _platformId);
    }

    function setRevNetEnabled(bool _enabled) external onlyFactoryAdmin {
        emit RevNetEnabledChanged(revNetEnabled, _enabled);
        revNetEnabled = _enabled;
    }

    /// @notice Share of the top inflow (bps) streamed live to each board's beneficiary. Independent of
    ///         percentToPlatformFeeReceiver: the two are NOT complementary shares of one pot. This
    ///         percent leaves first as a live stream; whatever the board retains accrues to backers,
    ///         and the platform fee is later taken out of THAT at settle time. At 10000 the board
    ///         retains nothing, so backers accrue nothing and the platform fee is moot.
    function setPercentToBeneficiary(uint256 _newPercent) external onlyFactoryAdmin {
        if (_newPercent > 10000) revert PercentTooHigh();
        emit PercentToBeneficiaryChanged(percentToBeneficiary, _newPercent);
        percentToBeneficiary = _newPercent;
    }

    function setRevNetTerminal(address _newTerminal) external onlyFactoryAdmin {
        if (_newTerminal == address(0)) revert ZeroRevNetTerminal();
        emit RevNetTerminalChanged(revNetTerminal, _newTerminal);
        revNetTerminal = _newTerminal;
    }

    function setRevNetProjectId(uint256 _newProjectId) external onlyFactoryAdmin {
        if (_newProjectId == 0) revert ZeroRevNetProjectId();
        emit RevNetProjectIdChanged(revNetProjectId, _newProjectId);
        revNetProjectId = _newProjectId;
    }

    function setPlatformFeeReceiver(address _newReceiver) external onlyFactoryAdmin {
        emit PlatformFeeReceiverChanged(platformFeeReceiver, _newReceiver);
        platformFeeReceiver = _newReceiver;
    }

    /// @notice Platform fee (bps) taken from each RETAINED amount at settle time, i.e. a share of what
    ///         is left after the beneficiary stream, not of total inflow. See setPercentToBeneficiary.
    function setPercentToPlatformFeeReceiver(uint256 _newPercent) external onlyFactoryAdmin {
        if (_newPercent > 10000) revert PercentTooHigh();
        emit PercentToPlatformFeeReceiverChanged(percentToPlatformFeeReceiver, _newPercent);
        percentToPlatformFeeReceiver = _newPercent;
    }

    function setFactoryAdmin(address _newAdmin) external onlyFactoryAdmin {
        if (_newAdmin == address(0)) revert ZeroFactoryAdmin();
        emit FactoryAdminChanged(factoryAdmin, _newAdmin);
        factoryAdmin = _newAdmin;
    }

    /// @notice Swaps the two clone targets as a pair, and is the only way either can change. Pass the
    ///         other side's current value to move just one. createLeaderboard is permissionless, so
    ///         separate setters would leave a window in which anyone could mint a board pairing a new
    ///         board implementation with an old Markee one, frozen that way for the board's whole life.
    /// @dev Both swaps reach only boards created after this call. Existing boards are EIP-1167 proxies
    ///      with their implementation baked into their bytecode, and each board additionally copies
    ///      markeeImplementation into its own storage at initialize and mints every Markee from that copy,
    ///      so a board created before this call keeps minting the old Markee for its entire life. The
    ///      factory's Superfluid registration authorizes this address rather than the code it registers,
    ///      so a swapped implementation becomes a SuperApp with no further governance review.
    function setImplementations(address _newLeaderboardImplementation, address _newMarkeeImplementation)
        external
        onlyFactoryAdmin
    {
        _setImplementations(_newLeaderboardImplementation, _newMarkeeImplementation);
    }

    /// @dev A board implementation carries HOST and ETHX as bytecode immutables every EIP-1167 clone
    ///      inherits, so reading both back off it is the only link between the implementation and this
    ///      factory: one built against a different host or SuperToken passes a code-length check and
    ///      then fails inside the callback on the first backer's stream, with every board already
    ///      created beyond repair. The Markee implementation, which the factory itself never calls, is
    ///      probed for the locked flag every clonable Markee sets in its constructor.
    /// @dev Runs from the constructor too, so the event log carries a genesis entry from address(0)
    ///      and an indexer can attribute every board to the implementation it was cloned from.
    function _setImplementations(address _newLeaderboardImplementation, address _newMarkeeImplementation) internal {
        if (_newLeaderboardImplementation.code.length == 0) revert ImplementationNotContract();
        if (_newMarkeeImplementation.code.length == 0) revert ImplementationNotContract();

        if (ISuperAppWiring(_newLeaderboardImplementation).HOST() != HOST) revert ImplementationHostMismatch();
        if (!ISuperAppWiring(_newLeaderboardImplementation).isAcceptedSuperToken(ETHX)) {
            revert ImplementationTokenMismatch();
        }
        if (!IMarkeeImplementation(_newMarkeeImplementation).initialized()) revert MarkeeImplementationNotLocked();

        if (_newLeaderboardImplementation != leaderboardImplementation) {
            emit LeaderboardImplementationChanged(leaderboardImplementation, _newLeaderboardImplementation);
            leaderboardImplementation = _newLeaderboardImplementation;
        }
        if (_newMarkeeImplementation != markeeImplementation) {
            emit MarkeeImplementationChanged(markeeImplementation, _newMarkeeImplementation);
            markeeImplementation = _newMarkeeImplementation;
        }
    }

    function setDefaultMinimumMonthlyRate(uint256 _newRate) external onlyFactoryAdmin {
        emit DefaultMinimumMonthlyRateChanged(defaultMinimumMonthlyRate, _newRate);
        defaultMinimumMonthlyRate = _newRate;
    }

    function setDefaultMaxMessageLength(uint256 _newLength) external onlyFactoryAdmin {
        if (_newLength == 0) revert ZeroMaxMessageLength();
        emit DefaultMaxMessageLengthChanged(defaultMaxMessageLength, _newLength);
        defaultMaxMessageLength = _newLength;
    }

    function setDefaultMaxNameLength(uint256 _newLength) external onlyFactoryAdmin {
        if (_newLength == 0) revert ZeroMaxNameLength();
        emit DefaultMaxNameLengthChanged(defaultMaxNameLength, _newLength);
        defaultMaxNameLength = _newLength;
    }

    function _validatePlatformTags(string calldata _platformName, string calldata _platformId) internal pure {
        if (bytes(_platformName).length == 0) revert EmptyPlatformName();
        if (bytes(_platformId).length == 0) revert EmptyPlatformId();
        if (bytes(_platformName).length > MAX_PLATFORM_TAG_LENGTH || bytes(_platformId).length > MAX_PLATFORM_TAG_LENGTH)
        {
            revert PlatformTagTooLong();
        }
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
        if (instance == address(0)) revert CloneFailed();
    }
}

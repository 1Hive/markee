// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Local integration fixtures only. Deliberately mutable so tests can change roles
// between challenge issuance and verification. Never deploy these to a live chain.
contract TestCouncil {
    address public owner;
    constructor(address a) { owner = a; }
    function isOwner(address a) external view returns (bool) { return a == owner; }
    function setOwner(address a) external { owner = a; }
    receive() external payable {}
    function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4) {
        if (signature.length != 65) return 0xffffffff;
        bytes32 r; bytes32 s; uint8 v;
        assembly { r := calldataload(signature.offset) s := calldataload(add(signature.offset, 32)) v := byte(0, calldataload(add(signature.offset, 64))) }
        return ecrecover(digest, v, r, s) == owner ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}
contract TestCommunity {
    address public councilSafe;
    constructor(address a) { councilSafe = a; }
    function setCouncil(address a) external { councilSafe = a; }
}
contract TestVault {
    address public router;
    constructor() { router = msg.sender; }
    receive() external payable {}
    function availableRevenue() external view returns (uint256,uint256,uint256,uint256) { return (address(this).balance,0,0,address(this).balance); }
    function release(address payable to, address payable keeper, uint256 fee) external {
        require(msg.sender == router);
        uint256 amount = address(this).balance;
        keeper.transfer(fee); to.transfer(amount-fee);
    }
}
contract TestRouter {
    struct Integration { uint256 communityChainId; address registryCommunity; address vault; address factory; address leaderboard; address seedMarkee; }
    mapping(bytes32 => Integration) public communityIntegration;
    mapping(bytes32 => address) public communityVault;
    mapping(address => bool) public keepers;
    uint256 public creations;
    uint256 public sweeps;
    constructor(address keeper) { keepers[keeper] = true; }
    function createCommunityLeaderboard(uint256 chainId,address community,string calldata,string calldata) external returns(address vault,address board,address seed) {
        require(keepers[msg.sender]); bytes32 key = keccak256(abi.encode(chainId,community));
        require(communityVault[key] == address(0)); vault=address(new TestVault());
        board=address(0x1234); seed=address(0x5678);
        communityVault[key]=vault; communityIntegration[key]=Integration(chainId,community,vault,address(0x9999),board,seed); creations++;
    }
    function bridgeConfiguration(uint256) external pure returns(address,uint8) {return (address(0),0);}
    function sweep(bytes32 key,bytes calldata,uint256,uint256 gasCost) external payable {
        require(keepers[msg.sender]); Integration memory integration=communityIntegration[key];
        TestVault(payable(integration.vault)).release(payable(TestCommunity(integration.registryCommunity).councilSafe()),payable(msg.sender),gasCost); sweeps++;
    }
}

import { parseAbi } from 'viem';
export const boardABI = parseAbi([
  'function VERSION() view returns (string)', 'function factory() view returns (address)',
  'function leaderboardName() view returns (string)', 'function minimumPrice() view returns (uint256)',
  'function minimumMonthlyRate() view returns (uint256)', 'function maxMessageLength() view returns (uint256)',
  'function maxNameLength() view returns (uint256)', 'function revNetEnabled() view returns (bool)',
  'function revNetTerminal() view returns (address)', 'function revNetProjectId() view returns (uint256)',
  'function markeeCount() view returns (uint256)', 'function getMarkees(uint256 offset,uint256 limit) view returns (address[])',
  'function getTopMarkees(uint256 limit) view returns (address[],uint256[])',
  'function isMarkeeOnLeaderboard(address) view returns (bool)',
  'function createMarkee(string message,string name) payable returns (address)',
  'function addFunds(address markee) payable', 'function updateMessage(address markee,string message)',
  'function updateName(address markee,string name)', 'function ETHX() view returns (address)',
  'function HOST() view returns (address)', 'function topMarkee() view returns (address)',
  'function effectiveRate(address) view returns (uint256)', 'function aggregateRate(address) view returns (uint256)',
  'function currentLegacyFloor(address) view returns (uint256)', 'function poolOf(address) view returns (address)',
  'function backerMarkee(address) view returns (address)', 'function backerDeposit(address) view returns (uint256)',
  'function pendingSettlement(address) view returns (uint256)', 'function withdrawDeposit()',
  'function settle(address[])', 'function claimTop(address)',
  'event MarkeeCreated(address indexed markeeAddress,address indexed owner,string message,string name,uint256 amount)',
  'event MarkeeCreated(address indexed markeeAddress,address indexed owner,string message,string name)',
  'event Settled(address indexed backer,uint256 amount,bool viaRevNet)',
]);
export const messageABI = parseAbi([
  'function owner() view returns (address)', 'function message() view returns (string)',
  'function name() view returns (string)', 'function totalFundsAdded() view returns (uint256)',
  'function pricingStrategy() view returns (address)',
]);
export const tokenABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function realtimeBalanceOfNow(address) view returns (int256,uint256,uint256,uint256)',
  'function downgradeToETH(uint256)', 'function upgradeByETHTo(address) payable',
  'function allowance(address,address) view returns (uint256)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
]);
export const cfaABI = parseAbi([
  'function getFlow(address token,address sender,address receiver) view returns (uint256,int96,uint256,uint256)',
  'function getNetFlow(address token,address account) view returns (int96)',
]);
export const gdaABI = parseAbi([
  'function getNetFlow(address token,address account) view returns (int96)',
  'function isMemberConnected(address pool,address member) view returns (bool)',
  'function connectPool(address pool,bytes ctx) returns (bytes)',
]);
export const poolABI = parseAbi([
  'function getMemberFlowRate(address member) view returns (int96)',
  'function getClaimableNow(address member) view returns (int256,uint256)',
  'function claimAll(address member) returns (bool)',
]);

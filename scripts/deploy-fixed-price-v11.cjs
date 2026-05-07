// deploy-fixed-price-v11.cjs
//
// Deploys 3 v1.1 FixedPriceStrategy contracts on Base.
// Each creates its own v1.1 Markee clone at deploy time.
//
// Usage: node deploy-fixed-price-v11.cjs [--dry-run]
//
// Requires: /tmp/markee-forge/out/FixedPriceStrategy.sol/FixedPriceStrategy.json
//   Build: cd /tmp/markee-forge && forge build
//
// Fund automation wallet before running:
//   0x000D356bB4D1E81CAb7cFA47D8707cdBDfEDE5af
//   Need ~0.001 ETH for 3 deployments.

const { ethers } = require('/tmp/node_modules/ethers');
const fs = require('fs');

const DRY_RUN = process.argv.includes('--dry-run');
const RPC = 'https://base-mainnet.g.alchemy.com/v2/MfatE-JTmlEIgHxhW40pO';
const AUTOMATION_WALLET_PK = '0xc78bb955aa01f6dfc6b7c108349906b26f6d4d248892737a0c2eba5797e56af7';

const MARKEE_IMPL        = '0x31069cA925f59da5116E4763131289C187F7fE3a';
const BENEFICIARY        = '0xAf4401E765dFf079aB6021BBb8d46E53E27613DB'; // Markee Safe
const PRICE              = ethers.parseEther('100');                         // 100 ETH in wei
const MAX_MESSAGE_LENGTH = 222n;
const MAX_NAME_LENGTH    = 22n;

const STRATEGIES = [
  { name: 'this is a sign.',            initialMessage: 'this is a sign.',             initialName: '' },
  { name: 'anyone can pay to change.',  initialMessage: 'anyone can pay to change.',   initialName: '' },
  { name: 'that funds the internet.',   initialMessage: 'that funds the open internet.', initialName: '' },
];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitTx(tx, label) {
  console.log(`  ${label}: ${tx.hash}`);
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error(`${label} reverted`);
  console.log(`  ✓ ${label} mined (block ${receipt.blockNumber})`);
  return receipt;
}

async function main() {
  const artifact = JSON.parse(
    fs.readFileSync('/tmp/markee-forge/out/FixedPriceStrategy.sol/FixedPriceStrategy.json', 'utf8')
  );
  const abi      = artifact.abi;
  const bytecode = artifact.bytecode.object;

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet   = new ethers.Wallet(AUTOMATION_WALLET_PK, provider);

  console.log('Automation wallet:', wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', ethers.formatEther(balance), 'ETH');
  console.log('Mode:', DRY_RUN ? 'DRY RUN (no transactions)' : 'LIVE');
  console.log('');

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const results = [];

  for (const s of STRATEGIES) {
    console.log(`Deploying: "${s.name}"`);
    console.log(`  initialMessage: "${s.initialMessage}"`);
    console.log(`  initialName:    "${s.initialName}"`);

    if (DRY_RUN) {
      console.log('  [DRY] Would deploy FixedPriceStrategy');
      results.push({ name: s.name, address: ethers.ZeroAddress, markeeAddress: ethers.ZeroAddress });
      console.log('');
      continue;
    }

    const contract = await factory.deploy(
      MARKEE_IMPL,
      s.initialMessage,
      s.initialName,
      BENEFICIARY,
      PRICE,
      MAX_MESSAGE_LENGTH,
      MAX_NAME_LENGTH,
    );
    const receipt = await waitTx(contract.deploymentTransaction(), `deploy FixedPriceStrategy "${s.name}"`);
    const strategyAddress = receipt.contractAddress;

    const deployed = new ethers.Contract(strategyAddress, abi, provider);
    const markeeAddress = await deployed.markeeAddress();

    console.log(`  Strategy: ${strategyAddress}`);
    console.log(`  Markee:   ${markeeAddress}`);
    results.push({ name: s.name, address: strategyAddress, markeeAddress });
    console.log('');

    await sleep(2000);
  }

  console.log('');
  console.log('=== RESULTS ===');
  console.log('Update CONTRACTS.fixedPriceStrategies in lib/contracts/addresses.ts:');
  console.log('');
  console.log('fixedPriceStrategies: [');
  for (const r of results) {
    console.log(`  { name: '${r.name}', address: '${r.address}' as const },`);
  }
  console.log('],');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

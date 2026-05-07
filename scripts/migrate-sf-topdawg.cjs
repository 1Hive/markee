// migrate-sf-topdawg.cjs
//
// Migrates the 32 Superfluid TopDawg markees to a new v1.1 Leaderboard.
//
// Steps:
//   1. Deploy a v1.1 Leaderboard proxy (EIP-1167 clone of the existing impl)
//   2. Initialize it with automation wallet as admin, SF beneficiary, Coop platformFeeReceiver
//   3. Run migrateFromLegacy(oldAddr) for each of the 32 legacy markees
//   4. Transfer admin to Coop multisig
//
// Usage: node migrate-sf-topdawg.cjs [--dry-run]

const { ethers } = require('/tmp/node_modules/ethers');

const DRY_RUN = process.argv.includes('--dry-run');
// If set, skip proxy deployment and use this existing uninitialized proxy
const RESUME_PROXY = process.env.RESUME_PROXY || null;
const RPC = 'https://base-mainnet.g.alchemy.com/v2/MfatE-JTmlEIgHxhW40pO';
const AUTOMATION_WALLET_PK = '0xc78bb955aa01f6dfc6b7c108349906b26f6d4d248892737a0c2eba5797e56af7';

// Addresses
// The old OI factory uses this impl which has migrateFromLegacy + v1.1 initialize
const LEADERBOARD_IMPL   = '0x63BABD83834ED8Ed55Ab2212416fE38c27F1Cf81';
const MARKEE_IMPL        = '0x31069cA925f59da5116E4763131289C187F7fE3a'; // matches old OI factory
const SF_BENEFICIARY     = '0xac808840f02c47C05507f48165d2222FF28EF4e1'; // original TopDawg beneficiary
const COOP_MULTISIG      = '0xAf4401E765dFf079aB6021BBb8d46E53E27613DB';

// The 32 legacy Superfluid TopDawg markee addresses (from on-chain scan)
const LEGACY_MARKEES = [
  '0xe72f92aa469fdbd875bc3f8fc745b94b2a15277d',
  '0xc639383b964333b002b0694ed67edde5181db5db',
  '0x322f593462ab69e56d8b7a71ecc89b520be08e53',
  '0x396bff9cab12790eb9ebd02a7150f13f11df2ed3',
  '0x59ee9f109cda991cd8aaffba9faf353b9bf8d5f4',
  '0x2e7c679530ba46e0941535f8d1d4366d4bf76132',
  '0x652519984e7df45c30527a88c2132f5b0512e999',
  '0xd7245d5dcd44c0ddd683f34d2735120a50e26b32',
  '0x171b0e43da56051ea74fe89821589693bae016fc',
  '0x30f8cb939f0575c43717dcef175b99d787a3444e',
  '0x544dfb7acd9057faad8f0d7bdf80fa54bb95352d',
  '0x7708c4c3d53ef01cd604ecbb75016e0c54b01237',
  '0x4903ce622b8f744a4ef7149573e13e68fdde4494',
  '0x67276585ca9182fc2ad58280f8aa7a68908e1fa0',
  '0xccd57ed33856036172a8975a64b54c78a3c2db7b',
  '0x8493d4d18879228e168232faf7eda791f20360f7',
  '0x6740a895dd60fb26cf9956c920bbc75b08d26f8f',
  '0xf298e0e8d6e5de548d73f022dbe04c1eb33fcf30',
  '0xacd29d5e83af136ef663c6b50352631b91d0f8ba',
  '0x808ac090d84573a69e0e41ade07c09b42fe68959',
  '0x654016b7f827f4f2f57f9fa6bf653892aed5b23c',
  '0x19e68e98da388b26946e702f93557d2062134367',
  '0x0010e937f2bcaa3f2937b768dae03e435378654b',
  '0x1c52b6cbe007894449e09a5ab9c3b021b568fdcc',
  '0xd4ccdecdebaf66581a5e7466fb3db9a33af3d612',
  '0x5c0cd658c4c073997eda65018a0225086c147fa7',
  '0x4bbb5008560499818a174e67426be060730184f5',
  '0xee6291a781bd1025cfa8591f3abfb0449c72206f',
  '0xffd99a2003456cd06df9fc8074da3aedcb202a1a',
  '0xa565628ee90c3bfd1b44ab599a13be7441db784b',
  '0xe147f29cd2dee6cf41cbfabcf9e60a1c15ec57fd',
  '0x6535865b71586e7443d686c0bec6ea8ed8bccffb',
];

const LEADERBOARD_ABI = [
  'function initialize(address _admin, address _beneficiaryAddress, address _platformFeeReceiver, string calldata _leaderboardName, address _markeeImplementation, uint256 _minimumPrice, uint256 _maxMessageLength, uint256 _maxNameLength, address _seedOwner) external returns (address)',
  'function migrateFromLegacy(address _oldMarkee) external returns (address)',
  'function setAdmin(address _newAdmin) external',
  'function admin() view returns (address)',
  'function markeeCount() view returns (uint256)',
  'function leaderboardName() view returns (string)',
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
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(AUTOMATION_WALLET_PK, provider);
  console.log('Automation wallet:', wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', ethers.formatEther(balance), 'ETH');
  console.log('Mode:', DRY_RUN ? 'DRY RUN (no transactions)' : 'LIVE');
  console.log('');

  // ── Step 1: Deploy EIP-1167 proxy of Leaderboard implementation ──────────────

  // EIP-1167 creation bytecode: deploys a 45-byte runtime proxy
  const implAddr = LEADERBOARD_IMPL.toLowerCase().slice(2); // 40 hex chars, no 0x
  const creationCode = '0x3d602d80600a3d3981f3363d3d373d3d3d363d73' + implAddr + '5af43d82803e903d91602b57fd5bf3';

  let leaderboardAddress;
  if (RESUME_PROXY) {
    leaderboardAddress = RESUME_PROXY;
    console.log('Step 1: Reusing existing proxy at', leaderboardAddress);
  } else if (DRY_RUN) {
    console.log('[DRY] Would deploy EIP-1167 proxy of', LEADERBOARD_IMPL);
    leaderboardAddress = ethers.ZeroAddress;
  } else {
    console.log('Step 1: Deploying v1.1 Leaderboard proxy...');
    const deployTx = await wallet.sendTransaction({ data: creationCode });
    const receipt = await waitTx(deployTx, 'deploy leaderboard proxy');
    leaderboardAddress = receipt.contractAddress;
    console.log('  Leaderboard deployed at:', leaderboardAddress);
  }

  console.log('');

  // ── Step 2: Initialize the leaderboard ───────────────────────────────────────

  const leaderboard = new ethers.Contract(leaderboardAddress, LEADERBOARD_ABI, wallet);

  if (DRY_RUN) {
    console.log('[DRY] Would initialize leaderboard:');
    console.log('  admin:', wallet.address);
    console.log('  beneficiary:', SF_BENEFICIARY);
    console.log('  platformFeeReceiver:', COOP_MULTISIG);
    console.log('  name: Superfluid');
    console.log('  markeeImpl:', MARKEE_IMPL);
  } else {
    console.log('Step 2: Initializing leaderboard...');
    const initTx = await leaderboard.initialize(
      wallet.address,       // admin
      SF_BENEFICIARY,       // beneficiaryAddress
      COOP_MULTISIG,        // platformFeeReceiver
      'Superfluid',         // leaderboardName
      MARKEE_IMPL,          // markeeImplementation
      1000000000000000n,    // minimumPrice (0.001 ETH)
      222n,                 // maxMessageLength
      22n,                  // maxNameLength
      wallet.address,       // seedOwner
      { gasLimit: 600000 }, // explicit limit to avoid under-estimation when proxy just deployed
    );
    await waitTx(initTx, 'initialize');
    const name = await leaderboard.leaderboardName();
    console.log('  Leaderboard name:', name);
  }

  console.log('');

  // ── Step 3: migrateFromLegacy for each of 32 markees ─────────────────────────

  const newMarkees = [];
  console.log(`Step 3: Migrating ${LEGACY_MARKEES.length} legacy markees...`);

  for (let i = 0; i < LEGACY_MARKEES.length; i++) {
    const oldAddr = LEGACY_MARKEES[i];
    if (DRY_RUN) {
      console.log(`  [DRY] ${i + 1}/${LEGACY_MARKEES.length} migrateFromLegacy(${oldAddr})`);
      newMarkees.push({ old: oldAddr, new: '0xDRYRUN' });
      continue;
    }

    try {
      const tx = await leaderboard.migrateFromLegacy(oldAddr);
      const receipt = await waitTx(tx, `migrate ${i + 1}/${LEGACY_MARKEES.length} ${oldAddr.slice(0, 10)}...`);

      // Parse MarkeeMigratedFromLegacy event to get new address
      const iface = new ethers.Interface([
        'event MarkeeMigratedFromLegacy(address indexed newMarkee, address indexed oldMarkee, address indexed owner, uint256 historicalFunds)'
      ]);
      let newAddr = null;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed) newAddr = parsed.args.newMarkee;
        } catch {}
      }
      newMarkees.push({ old: oldAddr, new: newAddr });
      await sleep(200);
    } catch (e) {
      console.error(`  ✗ FAILED migration for ${oldAddr}:`, e.message);
      newMarkees.push({ old: oldAddr, new: null, error: e.message });
    }
  }

  console.log('');

  // ── Step 4: Transfer admin to Coop multisig ───────────────────────────────────

  if (DRY_RUN) {
    console.log('[DRY] Would transfer admin to', COOP_MULTISIG);
  } else {
    console.log('Step 4: Transferring admin to Coop multisig...');
    const tx = await leaderboard.setAdmin(COOP_MULTISIG);
    await waitTx(tx, 'setAdmin');
    const newAdmin = await leaderboard.admin();
    console.log('  New admin:', newAdmin);
  }

  console.log('');

  // ── Summary ───────────────────────────────────────────────────────────────────

  console.log('=== MIGRATION COMPLETE ===');
  console.log('New Leaderboard address:', leaderboardAddress);
  console.log('Migration pairs (old -> new):');
  for (const pair of newMarkees) {
    if (pair.error) console.log(`  FAILED ${pair.old}: ${pair.error}`);
    else console.log(`  ${pair.old} -> ${pair.new ?? 'null'}`);
  }
  console.log('');
  console.log('Next steps:');
  console.log('  1. Update MIGRATION.md with new Superfluid leaderboard address:', leaderboardAddress);
  console.log('  2. Add leaderboard to frontend Superfluid API route');
  console.log('  3. Rotate KV credentials (KV_REST_API_URL / KV_REST_API_TOKEN)');
}

main().catch(e => { console.error(e); process.exit(1); });

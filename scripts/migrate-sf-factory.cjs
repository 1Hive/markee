// migrate-sf-factory.cjs
//
// Deploys a new v1.1 Superfluid LeaderboardFactory and migrates all existing
// v1.0 leaderboards from the old factory to new v1.1 counterparts.
//
// Per-leaderboard steps:
//   1. Read config from old v1.0 leaderboard (beneficiary, name, markees)
//      Admin is resolved from the factory's LeaderboardCreated event logs
//   2. Create new v1.1 leaderboard on new factory (automation wallet becomes admin)
//   3. Remove the automation wallet's seed markee (migratePricingStrategy → COOP)
//   4. migrateFromLegacy() for every markee on the old leaderboard
//   5. Transfer admin back to the original creator
//
// Usage:
//   node migrate-sf-factory.cjs [--dry-run]
//   RESUME_FACTORY=0x... node migrate-sf-factory.cjs   # skip factory deploy, reuse existing
//
// Requires:
//   /tmp/markee-forge/out/LeaderboardFactory.sol/LeaderboardFactory.json
//
// Output: /tmp/migration-sf-factory-results.json

const { ethers } = require('/tmp/node_modules/ethers');
const fs = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const RESUME_FACTORY = process.env.RESUME_FACTORY || null;
const RPC = 'https://base-mainnet.g.alchemy.com/v2/MfatE-JTmlEIgHxhW40pO';
const AUTOMATION_WALLET_PK = '0xc78bb955aa01f6dfc6b7c108349906b26f6d4d248892737a0c2eba5797e56af7';

// V1.1 implementations (same as OpenInternet and GitHub platforms)
const LEADERBOARD_IMPL = '0x63BABD83834ED8Ed55Ab2212416fE38c27F1Cf81';
const MARKEE_IMPL      = '0x31069cA925f59da5116E4763131289C187F7fE3a';
const COOP_MULTISIG    = '0xAf4401E765dFf079aB6021BBb8d46E53E27613DB';

// Old v1.0 factory
const OLD_FACTORY_ADDR = '0x45Ce642d1Dc0638887e3312c95a66fA8fcbAe09d';
// Approximate deploy block for the old factory (used as getLogs fromBlock)
const OLD_FACTORY_DEPLOY_BLOCK = 43452028n;

// ── ABIs ──────────────────────────────────────────────────────────────────────

const OLD_FACTORY_ABI = [
  'function getLeaderboards(uint256 offset, uint256 limit) view returns (address[])',
  'function leaderboardCount() view returns (uint256)',
];

// v1.0 factory LeaderboardCreated event — admin is the 2nd indexed arg
const OLD_FACTORY_LEADERBOARD_CREATED_EVENT =
  'event LeaderboardCreated(address indexed leaderboardAddress, address indexed admin, address indexed beneficiaryAddress, string name, address seedMarkeeAddress)';

const OLD_LEADERBOARD_ABI = [
  'function beneficiaryAddress() view returns (address)',
  'function leaderboardName() view returns (string)',
  'function getTopMarkees(uint256 limit) view returns (address[], uint256[])',
];

const NEW_FACTORY_ABI = [
  'function createLeaderboard(address _beneficiaryAddress, string calldata _leaderboardName) returns (address leaderboardAddress, address seedMarkeeAddress)',
  'function leaderboardCount() view returns (uint256)',
];

const NEW_FACTORY_LEADERBOARD_CREATED_EVENT =
  'event LeaderboardCreated(address indexed leaderboardAddress, address indexed admin, address indexed beneficiaryAddress, address platformFeeReceiver, string name, address seedMarkeeAddress)';

const NEW_LEADERBOARD_ABI = [
  'function setAdmin(address _newAdmin) external',
  'function migratePricingStrategy(address _markeeAddress, address _newStrategy) external',
  'function migrateFromLegacy(address _oldMarkee) external returns (address)',
];

const LEGACY_MIGRATED_EVENT =
  'event MarkeeMigratedFromLegacy(address indexed newMarkeeAddress, address indexed oldMarkeeAddress, address indexed owner, uint256 historicalFunds)';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitTx(tx, label) {
  console.log(`    ${label}: ${tx.hash}`);
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error(`${label} reverted`);
  console.log(`    ✓ mined (block ${receipt.blockNumber})`);
  return receipt;
}

function parseNewLeaderboardCreated(receipt) {
  const iface = new ethers.Interface([NEW_FACTORY_LEADERBOARD_CREATED_EVENT]);
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed) {
        return {
          leaderboardAddress: parsed.args.leaderboardAddress,
          seedMarkeeAddress:  parsed.args.seedMarkeeAddress,
        };
      }
    } catch {}
  }
  return null;
}

function parseMigratedFromLegacy(receipt) {
  const iface = new ethers.Interface([LEGACY_MIGRATED_EVENT]);
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed) return parsed.args.newMarkeeAddress;
    } catch {}
  }
  return null;
}

// Resolves the original admin (creator) for every old leaderboard by scanning
// the old factory's LeaderboardCreated event logs. Returns Map<lowercaseAddr → adminAddr>.
async function resolveOriginalAdmins(provider) {
  console.log('  Scanning old factory logs for original admins...');
  const iface = new ethers.Interface([OLD_FACTORY_LEADERBOARD_CREATED_EVENT]);
  const adminMap = new Map();
  const CHUNK = 9000n;
  let start = OLD_FACTORY_DEPLOY_BLOCK;
  const latest = await provider.getBlockNumber();

  while (start <= latest) {
    const end = start + CHUNK - 1n > BigInt(latest) ? BigInt(latest) : start + CHUNK - 1n;
    try {
      const logs = await provider.getLogs({
        address: OLD_FACTORY_ADDR,
        fromBlock: start,
        toBlock: end,
      });
      for (const log of logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed) {
            const lb    = parsed.args.leaderboardAddress.toLowerCase();
            const admin = parsed.args.admin;
            adminMap.set(lb, admin);
          }
        } catch {}
      }
    } catch (e) {
      console.warn(`    ⚠ getLogs ${start}→${end} failed: ${e.message}`);
    }
    start = end + 1n;
    await sleep(100);
  }

  console.log(`  Resolved ${adminMap.size} admins from factory logs`);
  return adminMap;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Verify forge artifact exists (only needed for live factory deploy)
  const ARTIFACT_PATH = '/tmp/markee-forge/out/LeaderboardFactory.sol/LeaderboardFactory.json';
  if (!DRY_RUN && !RESUME_FACTORY && !fs.existsSync(ARTIFACT_PATH)) {
    console.error(`ERROR: Forge artifact not found at ${ARTIFACT_PATH}`);
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet   = new ethers.Wallet(AUTOMATION_WALLET_PK, provider);

  console.log('Automation wallet:', wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', ethers.formatEther(balance), 'ETH');
  console.log('Mode:', DRY_RUN ? 'DRY RUN (no transactions)' : 'LIVE');
  if (RESUME_FACTORY) console.log('Resuming with factory:', RESUME_FACTORY);
  console.log('');

  if (!DRY_RUN && ethers.formatEther(balance) < 0.05) {
    console.error('ERROR: Automation wallet needs at least 0.05 ETH for gas.');
    console.error(`Fund: ${wallet.address}`);
    process.exit(1);
  }

  // ── Step 1: Deploy new v1.1 factory ────────────────────────────────────────

  let newFactoryAddr;

  if (RESUME_FACTORY) {
    newFactoryAddr = RESUME_FACTORY;
    console.log('Step 1: Using existing factory at', newFactoryAddr);
  } else if (DRY_RUN) {
    console.log('Step 1: [DRY] Would deploy v1.1 LeaderboardFactory for Superfluid');
    console.log('  platformName:             Superfluid');
    console.log('  platformId:               superfluid');
    console.log('  leaderboardImplementation:', LEADERBOARD_IMPL);
    console.log('  markeeImplementation:     ', MARKEE_IMPL);
    console.log('  platformFeeReceiver:      ', COOP_MULTISIG);
    console.log('  factoryAdmin:             ', COOP_MULTISIG);
    newFactoryAddr = ethers.ZeroAddress;
  } else {
    console.log('Step 1: Deploying new v1.1 LeaderboardFactory for Superfluid...');
    const artifact  = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
    const factory   = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, wallet);
    const contract  = await factory.deploy(
      'Superfluid',    // platformName
      'superfluid',    // platformId
      LEADERBOARD_IMPL,
      MARKEE_IMPL,
      COOP_MULTISIG,   // platformFeeReceiver
      COOP_MULTISIG,   // factoryAdmin
    );
    const receipt = await waitTx(contract.deploymentTransaction(), 'deploy LeaderboardFactory');
    newFactoryAddr = receipt.contractAddress;
    console.log('  New factory:', newFactoryAddr);
  }

  console.log('');

  // ── Step 2: Resolve original admins from old factory logs ──────────────────

  console.log('Step 2: Resolving original admins from old factory logs...');
  let adminMap = new Map();
  if (!DRY_RUN) {
    adminMap = await resolveOriginalAdmins(provider);
  } else {
    console.log('  [DRY] Skipping log scan');
  }
  console.log('');

  // ── Step 3: Fetch all old leaderboards ─────────────────────────────────────

  console.log('Step 3: Fetching old leaderboards from', OLD_FACTORY_ADDR, '...');
  const oldFactory = new ethers.Contract(OLD_FACTORY_ADDR, OLD_FACTORY_ABI, provider);
  const oldLeaderboards = await oldFactory.getLeaderboards(0n, 1000n);
  console.log(`  Found ${oldLeaderboards.length} leaderboards to migrate`);
  console.log('');

  // ── Step 4: Migrate each leaderboard ───────────────────────────────────────

  const newFactory = new ethers.Contract(newFactoryAddr, NEW_FACTORY_ABI, wallet);

  const migrationResults = [];

  for (let i = 0; i < oldLeaderboards.length; i++) {
    const oldAddr = oldLeaderboards[i].toLowerCase();
    console.log(`[${i + 1}/${oldLeaderboards.length}] Migrating ${oldAddr}`);

    // ── 4a. Resolve original admin from factory logs ──────────────────────────
    const originalAdmin = adminMap.get(oldAddr) ?? COOP_MULTISIG;

    // ── 4b. Read config from old leaderboard ─────────────────────────────────
    const oldLb = new ethers.Contract(oldAddr, OLD_LEADERBOARD_ABI, provider);

    let beneficiary, lbName, markeeAddrs;

    try {
      beneficiary = await oldLb.beneficiaryAddress();
    } catch {
      console.warn('    ⚠ beneficiaryAddress() reverted, falling back to original admin');
      beneficiary = originalAdmin;
    }

    try {
      lbName = await oldLb.leaderboardName();
      if (!lbName) lbName = `Superfluid ${oldAddr.slice(2, 10)}`;
    } catch {
      console.warn('    ⚠ leaderboardName() reverted, using address-based name');
      lbName = `Superfluid ${oldAddr.slice(2, 10)}`;
    }

    try {
      const [addrs] = await oldLb.getTopMarkees(200n);
      markeeAddrs = addrs.map(a => a.toLowerCase());
    } catch (e) {
      console.warn('    ⚠ getTopMarkees() failed:', e.message);
      markeeAddrs = [];
    }

    console.log(`    original admin = ${originalAdmin}`);
    console.log(`    beneficiary    = ${beneficiary}`);
    console.log(`    name           = "${lbName}"`);
    console.log(`    markees        = ${markeeAddrs.length}`);

    if (DRY_RUN) {
      console.log('    [DRY] Would: createLeaderboard → removeSeed → migrateFromLegacy × N → setAdmin');
      migrationResults.push({
        old: oldAddr,
        new: '0xDRYRUN',
        originalAdmin,
        beneficiary,
        name: lbName,
        oldMarkees: markeeAddrs,
        newMarkees: markeeAddrs.map(() => ({ old: '?', new: '0xDRYRUN' })),
      });
      console.log('');
      continue;
    }

    // ── 4c. Create new v1.1 leaderboard via new factory ──────────────────────
    let newLeaderboardAddr, automationSeedAddr;
    try {
      const tx = await newFactory.createLeaderboard(beneficiary, lbName, { gasLimit: 800000 });
      const receipt = await waitTx(tx, 'createLeaderboard');
      const parsed = parseNewLeaderboardCreated(receipt);
      if (!parsed) throw new Error('LeaderboardCreated event not found in receipt');
      newLeaderboardAddr = parsed.leaderboardAddress.toLowerCase();
      automationSeedAddr = parsed.seedMarkeeAddress.toLowerCase();
      console.log(`    new leaderboard: ${newLeaderboardAddr}`);
      console.log(`    automation seed: ${automationSeedAddr}`);
    } catch (e) {
      console.error(`    ✗ createLeaderboard failed:`, e.message);
      migrationResults.push({ old: oldAddr, new: null, error: `createLeaderboard: ${e.message}` });
      await sleep(1000);
      continue;
    }

    const newLb = new ethers.Contract(newLeaderboardAddr, NEW_LEADERBOARD_ABI, wallet);

    // ── 4d. Remove automation wallet's seed markee ────────────────────────────
    try {
      const tx = await newLb.migratePricingStrategy(automationSeedAddr, COOP_MULTISIG, { gasLimit: 200000 });
      await waitTx(tx, 'remove automation seed');
    } catch (e) {
      // Non-fatal — seed stays at bottom of leaderboard
      console.warn(`    ⚠ migratePricingStrategy failed (seed stays): ${e.message}`);
    }

    await sleep(300);

    // ── 4e. migrateFromLegacy for each old markee ─────────────────────────────
    const newMarkeeAddrs = [];
    for (let j = 0; j < markeeAddrs.length; j++) {
      const oldMarkee = markeeAddrs[j];
      try {
        const tx = await newLb.migrateFromLegacy(oldMarkee, { gasLimit: 500000 });
        const receipt = await waitTx(tx, `migrateFromLegacy [${j + 1}/${markeeAddrs.length}]`);
        const newAddr = parseMigratedFromLegacy(receipt);
        newMarkeeAddrs.push({ old: oldMarkee, new: newAddr?.toLowerCase() ?? null });
        await sleep(200);
      } catch (e) {
        console.error(`    ✗ migrateFromLegacy(${oldMarkee}) failed:`, e.message);
        newMarkeeAddrs.push({ old: oldMarkee, new: null, error: e.message });
      }
    }

    // ── 4f. Transfer admin back to original creator ───────────────────────────
    try {
      const tx = await newLb.setAdmin(originalAdmin, { gasLimit: 100000 });
      await waitTx(tx, `setAdmin → ${originalAdmin.slice(0, 10)}...`);
    } catch (e) {
      // Fall back to COOP_MULTISIG
      console.warn(`    ⚠ setAdmin(original) failed: ${e.message} — keeping COOP`);
      try {
        const tx = await newLb.setAdmin(COOP_MULTISIG, { gasLimit: 100000 });
        await waitTx(tx, `setAdmin → COOP_MULTISIG (fallback)`);
      } catch (e2) {
        console.error(`    ✗ setAdmin fallback also failed:`, e2.message);
      }
    }

    migrationResults.push({
      old: oldAddr,
      new: newLeaderboardAddr,
      originalAdmin,
      beneficiary,
      name: lbName,
      oldMarkees: markeeAddrs,
      newMarkees: newMarkeeAddrs,
    });

    console.log(`    ✓ done`);
    console.log('');
    await sleep(500);
  }

  // ── Output ────────────────────────────────────────────────────────────────

  console.log('');
  console.log('=== MIGRATION COMPLETE ===');
  console.log('New factory address:', newFactoryAddr);
  console.log('');

  const succeeded = migrationResults.filter(r => r.new && !r.error);
  const failed    = migrationResults.filter(r => !r.new || r.error);
  console.log(`Succeeded: ${succeeded.length}  Failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log('\nFailed leaderboards:');
    for (const f of failed) console.log(`  ${f.old}: ${f.error}`);
  }

  if (!DRY_RUN) {
    console.log('');
    console.log('=== NEXT STEPS ===');
    console.log('1. Update migrations/markee-migrations.csv:');
    console.log(`   Line 4: factory,Superfluid,,${OLD_FACTORY_ADDR},${newFactoryAddr},,,,`);
    console.log('');
    console.log('2. Update frontend/lib/contracts/addresses.ts:');
    console.log(`   FACTORIES.SUPERFLUID: '${newFactoryAddr}'`);
    console.log('');
    console.log('3. Update frontend/app/api/superfluid/leaderboards/route.ts:');
    console.log(`   SUPERFLUID_FACTORY_ADDRESS = '${newFactoryAddr}'`);
    console.log('');
    console.log('4. Update frontend/app/api/cron/superfluid-points/route.ts:');
    console.log(`   LEADERBOARD_FACTORY_ADDRESS = '${newFactoryAddr.toLowerCase()}'`);
    console.log(`   FACTORY_DEPLOY_BLOCK = <block number from factory deploy tx>`);
    console.log('');
    console.log('5. Add old→new leaderboard redirect mapping to [address]/page.tsx');
    console.log('   (see migration-sf-factory-results.json for address pairs)');
  }

  // Write JSON output for reference
  const output = {
    newFactoryAddress: newFactoryAddr,
    oldFactoryAddress: OLD_FACTORY_ADDR,
    migrations: migrationResults,
  };
  const outputPath = '/tmp/migration-sf-factory-results.json';
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log('');
  console.log(`Full results saved to: ${outputPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
execFileSync('forge', ['build', '--quiet'], {
  env: { ...process.env, FOUNDRY_PROFILE: 'revenue' },
  stdio: 'inherit',
});

// Initial v1 layout. A change requires an explicit upgrade compatibility review;
// do not regenerate these merely to make CI green. AST ids are intentionally ignored.
const baselines = {
  // Pre-deployment review: communityPayoutNonce appended at slot 10, __gap 40 -> 39 (total unchanged).
  CommunityRevenueRouter: '2322918cd35eb13c3d940af44e5cbc742c3a57db2643fa4895f807a39767278f',
  CommunityRevenueReceiver: '07e8976018e7c273c0ad362658ed951d177c00892fc7bb7b02bf7762ce8f95df',
  GardensCommunityAdapter: 'ebff8e786aacc1c368307f5feb82e16c0371de3aff3e50fa6a5eb00674955db1',
  RevnetCommunityAdapter: 'cce22a236ca92e7c5c97b2a297e5320b10bb177309009ec54737c56f297eb76c',
};
const namespaces = {
  '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol': 'd20bb6bb32dd1fdb895914012ad08dc1e4bbd66df2e75a02c1ca97d884df70ed',
  '@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol': '79d72231f264af92799a24d6df08ccf3c044aef38933d285f792cae105421989',
  '@openzeppelin/contracts/proxy/utils/Initializable.sol': 'f527a063813c2bf60c153fb08e38539578935402894fcc36fac42324ca325d3b',
  '@openzeppelin/contracts/utils/ReentrancyGuard.sol': '94e409e8f6e3184236651a6cc2b1a6a3ea0f0a25eb85b71e524ad5791bb2fbc8',
};
const hash = value => createHash('sha256').update(value).digest('hex');

for (const [name, expected] of Object.entries(baselines)) {
  const { storageLayout: layout } = JSON.parse(readFileSync(`out/revenue/${name}.sol/${name}.json`, 'utf8'));
  const type = id => {
    const t = layout.types[id];
    return {
      label: t.label, encoding: t.encoding, bytes: t.numberOfBytes,
      ...(t.key ? { key: type(t.key) } : {}),
      ...(t.value ? { value: type(t.value) } : {}),
      ...(t.base ? { base: type(t.base) } : {}),
      ...(t.members ? { members: t.members.map(field) } : {}),
    };
  };
  const field = f => ({ label: f.label, slot: f.slot, offset: f.offset, type: type(f.type) });
  assert.equal(hash(JSON.stringify(layout.storage.map(field))), expected, `${name}: storage layout changed`);
  console.log(`${name}: layout matches v1`);
}
// Namespaced OZ storage is absent from solc's ordinary storage-layout output.
for (const [path, expected] of Object.entries(namespaces)) {
  assert.equal(hash(readFileSync(`node_modules/${path}`)), expected, `${path}: namespaced base changed`);
}
console.log('OpenZeppelin namespaced storage sources match the reviewed baseline');

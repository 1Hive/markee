import assert from 'node:assert/strict'
import { readFile, appendFile, writeFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { pathToFileURL } from 'node:url'

const HOUR = 3_600_000
const SCANS_PER_HOUR = 12
const periodic = ['warm', 'edit', 'hourly-reconcile']

export function compareRpcFixtures(base, candidate) {
  const index = report => {
    assert.ok(report.schemaVersion === 2 && report.status === 'fixtures-only' &&
      report.mode === 'deterministic-fixture' && report.members === base.members, 'RPC fixture reports are not comparable')
    const rows = new Map()
    for (const { scenario, estimatedCU, methods } of report.results) {
      assert.ok(!rows.has(scenario) && Number.isSafeInteger(estimatedCU) && estimatedCU >= 0, 'Invalid fixture cost: ' + scenario)
      rows.set(scenario, { estimatedCU, methods })
    }
    return rows
  }
  const before = index(base)
  const after = index(candidate)
  assert.ok(before.size === after.size && [...before.keys()].every(scenario => after.has(scenario)) &&
    periodic.every(scenario => before.has(scenario)), 'RPC fixture scenarios are not comparable')
  return {
    changed: !isDeepStrictEqual(before, after),
    deltas: Object.fromEntries(periodic.map(scenario => [
      scenario, after.get(scenario).estimatedCU - before.get(scenario).estimatedCU,
    ])),
  }
}

export function projectRegression(baseline, base, candidate, config, now = Date.now()) {
  assert.ok(['passed', 'over-limit'].includes(baseline.status) && baseline.account === 'Markee' &&
    baseline.scope === 'all-apps' && baseline.source === 'alchemy-admin-api', 'Missing validated Alchemy baseline')
  const observed = Date.parse(baseline.asOf)
  const end = Date.parse(baseline.billingPeriod?.endTime)
  assert.ok(Date.parse(baseline.billingPeriod?.startTime) < observed && now < end &&
    observed <= now && now - observed <= config.maxInputAgeHours * HOUR, 'Alchemy baseline is stale or from another billing period')
  const limit = config.monthlyLimitCU
  const projected = baseline.projectedMonthEndCU
  assert.ok(Number.isSafeInteger(projected) && projected >= 0 && baseline.monthlyLimitCU === limit, 'Invalid baseline CU or limit')
  const { deltas } = compareRpcFixtures(base, candidate)
  const extraPerScan = Math.max(0, ...Object.values(deltas))
  const addedCU = Math.ceil(extraPerScan * SCANS_PER_HOUR * (end - now) / HOUR)
  const projectedWithPR = projected + addedCU
  return { projected, limit, deltas, extraPerScan, addedCU, projectedWithPR,
    status: projectedWithPR <= limit ? 'within-limit' : addedCU > 0 ? 'regression-over-limit' : 'baseline-over-limit' }
}

async function main() {
  const [usage, base, candidate] = process.argv.slice(2)
  const json = async file => JSON.parse(await readFile(file, 'utf8'))
  if (usage === '--compare') {
    const { changed } = compareRpcFixtures(await json(base), await json(candidate))
    console.log(changed ? 'Mocked RPC usage changed.' : 'Mocked RPC usage is unchanged. Skipping the live forecast.')
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, 'changed=' + changed + '\n')
    return
  }
  const config = JSON.parse(await readFile(new URL('./rpc-monthly-budget.json', import.meta.url), 'utf8'))
  let report, live
  try {
    live = await json(usage)
    report = projectRegression(live, await json(base), await json(candidate), config)
  } catch (error) {
    const message = 'PR forecast unavailable: ' + error.message
    console.log('::warning::' + message)
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, message + '\n')
    if (process.env.RPC_PR_REPORT) {
      await writeFile(process.env.RPC_PR_REPORT, '## Alchemy PR forecast\n\nForecast unavailable. See the workflow log for input validation details.\n')
    }
    return
  }
  const formatCU = value => value.toLocaleString('en-US') + ' CU'
  const headroom = report.limit - report.projectedWithPR
  const summary = [
    '## Alchemy PR forecast',
    '',
    '| Deployed forecast | Estimated PR increase | Forecast with PR | Limit |',
    '| ---: | ---: | ---: | ---: |',
    '| ' + [report.projected, report.addedCU, report.projectedWithPR, report.limit].map(value => value.toLocaleString('en-US') + ' CU').join(' | ') + ' |',
    '',
    '**Budget margin:** ' + formatCU(Math.abs(headroom)) + (headroom < 0 ? ' over limit' : ' remaining'),
    '',
    'Alchemy baseline measured at ' + new Date(live.asOf).toISOString() + '.',
    '',
    '| Moderation scan | PR change per scan |',
    '| --- | ---: |',
    ...Object.entries(report.deltas).map(([scenario, delta]) =>
      '| ' + scenario + ' | ' + (delta > 0 ? '+' : '') + formatCU(delta) + ' |'),
    '',
    'Models the largest positive periodic moderation-scan delta at 12 scans/hour. Other traffic keeps the deployed baseline. Undeployed savings are excluded.',
    '',
    'Result: **' + report.status + '**',
  ].join('\n')
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary + '\n')
  if (process.env.RPC_PR_REPORT) await writeFile(process.env.RPC_PR_REPORT, summary + '\n')
  if (report.status === 'regression-over-limit') {
    console.log('::error::This PR increases modeled RPC usage and the projected account total exceeds the monthly CU limit.')
    process.exitCode = 1
  } else if (report.status === 'baseline-over-limit') {
    console.log('::warning::Deployed account usage is already forecast over the limit. This check found no modeled PR increase.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()

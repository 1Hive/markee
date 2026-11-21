import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { fetchAlchemyUsage } from './alchemy-usage-api'
import { monthlyForecast } from './rpc-monthly-forecast'
import { AssertionError } from 'node:assert'

async function main() {
  const directory = 'test-results/alchemy-usage'
  await mkdir(directory, { recursive: true })
  let report: Record<string, unknown>
  let summary: string
  try {
    const config = JSON.parse(await readFile('tests/integration/rpc-monthly-budget.json', 'utf8'))
    const usage = await fetchAlchemyUsage(process.env.ALCHEMY_ADMIN_ACCESS_KEY ?? '')
    const forecast = monthlyForecast(usage, config)
    report = forecast
    summary = `## Alchemy account budget\n\nStatus: **${forecast.status}**\n\n| Metric | CU |\n| --- | ---: |\n| Used this month | ${forecast.usedCU.toLocaleString('en-US')} |\n| Projected month end | ${forecast.projectedMonthEndCU.toLocaleString('en-US')} |\n| Monthly limit | ${forecast.monthlyLimitCU.toLocaleString('en-US')} |\n| Forecast headroom | ${forecast.headroomCU.toLocaleString('en-US')} |\n\nObserved: ${forecast.asOf}. All apps included. No hypothetical optimization savings.\n\nThis measures deployed account usage; it does not predict an unmerged PR's cost.\n`
    if (forecast.status !== 'passed') process.exitCode = 1
  } catch (error) {
    // Validation errors and sanitized HTTP failures contain no raw provider response.
    const message = error instanceof AssertionError ? error.message.split('\n')[0]
      : error instanceof Error ? error.message : 'Account usage check failed'
    report = { status: 'unavailable', error: message }
    summary = `## Alchemy account budget\n\n**Unavailable** — no valid forecast was produced. See the JSON report for the validation error.\n`
    process.exitCode = 1
  }
  await writeFile(`${directory}/forecast.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary)
}
main().catch(() => { console.error('Unable to write Alchemy account budget report'); process.exitCode = 1 })

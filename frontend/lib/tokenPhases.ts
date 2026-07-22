export type MarkeeTokenPhase = {
  idx: number
  stage: number
  rate: number
  start: Date
  end: Date
}

export const REVNET_BUYER_TOKEN_SHARE = 0.62
export const LEADERBOARD_REVNET_SHARE = 0.38

const SEASON_MS = 91.31 * 24 * 60 * 60 * 1000
const SCHEDULE_START = new Date('2025-12-21T00:00:00Z')

function buildMarkeeTokenPhases(): MarkeeTokenPhase[] {
  const rules = [
    { stage: 1, cut: 0.5, seasons: 4 },
    { stage: 2, cut: 0.2, seasons: 8 },
    { stage: 3, cut: 0.1, seasons: 6 },
  ]

  const phases: MarkeeTokenPhase[] = []
  let rate = 100_000
  let idx = 0

  for (const rule of rules) {
    for (let i = 0; i < rule.seasons; i++) {
      phases.push({
        idx,
        stage: rule.stage,
        rate: Math.round(rate),
        start: new Date(SCHEDULE_START.getTime() + idx * SEASON_MS),
        end: new Date(SCHEDULE_START.getTime() + (idx + 1) * SEASON_MS),
      })
      rate *= 1 - rule.cut
      idx += 1
    }
  }

  return phases
}

export const MARKEE_TOKEN_PHASES = buildMarkeeTokenPhases()

export function getCurrentMarkeeTokenPhase(now = Date.now()): MarkeeTokenPhase {
  for (const phase of MARKEE_TOKEN_PHASES) {
    if (now < phase.end.getTime()) return phase
  }
  return MARKEE_TOKEN_PHASES[MARKEE_TOKEN_PHASES.length - 1]
}

export function getCurrentGrossMarkeeRate(now = Date.now()): number {
  return getCurrentMarkeeTokenPhase(now).rate
}

export function estimateDirectRevnetMarkeeTokens(ethAmount: number, now = Date.now()): number {
  return ethAmount * getCurrentGrossMarkeeRate(now) * REVNET_BUYER_TOKEN_SHARE
}

export function estimateLeaderboardPurchaseMarkeeTokens(ethAmount: number, now = Date.now()): number {
  return ethAmount * LEADERBOARD_REVNET_SHARE * getCurrentGrossMarkeeRate(now) * REVNET_BUYER_TOKEN_SHARE
}

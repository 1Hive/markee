// The automatic moderation policy an integration selected, as one key carried through snapshots,
// reviews, checkout and views. Presets keep their names (and existing policy versions). Any other
// combination of the optional rules is `custom:` followed by one bit per rule, in RULE_ORDER.
export type ModerationPreset = 'relaxed' | 'standard' | 'strict'
export type CustomModerationPolicy = `custom:${'0' | '1'}${'0' | '1'}${'0' | '1'}${'0' | '1'}`
export type ModerationSeverity = ModerationPreset | CustomModerationPolicy

export interface ModerationRuleSet { profanity: boolean; links: boolean; addresses: boolean; ens: boolean }
export const RULE_ORDER = ['profanity', 'links', 'addresses', 'ens'] as const
type RuleName = typeof RULE_ORDER[number]

const PRESETS: Record<ModerationPreset, ModerationRuleSet> = {
  relaxed: { profanity: false, links: false, addresses: false, ens: false },
  standard: { profanity: true, links: false, addresses: false, ens: false },
  strict: { profanity: true, links: true, addresses: true, ens: true },
}

function keyOf(rules: ModerationRuleSet): ModerationSeverity {
  for (const preset of ['relaxed', 'standard', 'strict'] as const) {
    if (RULE_ORDER.every(name => PRESETS[preset][name] === rules[name])) return preset
  }
  return `custom:${RULE_ORDER.map(name => (rules[name] ? '1' : '0')).join('')}` as CustomModerationPolicy
}

/** Validates a `severity` value: a preset name, or a policy key this server issued. */
export function moderationSeverity(value: unknown): ModerationSeverity {
  if (value === undefined) return 'standard'
  if (value === 'relaxed' || value === 'standard' || value === 'strict') return value
  if (typeof value === 'string' && /^custom:[01]{4}$/.test(value)) return keyOf(moderationRules(value as CustomModerationPolicy))
  throw new Error('Invalid moderation severity')
}

/**
 * Resolves a request's `severity` and optional `rules` (the complete comma-separated list of
 * enabled optional rules, e.g. "profanity,ens"; an empty string enables none). `rules`, when
 * present, takes precedence over `severity`.
 */
export function moderationPolicy(severity: unknown, rules?: unknown): ModerationSeverity {
  const base = moderationSeverity(severity)
  if (rules === undefined || rules === null) return base
  // The longest valid list, all four rules, is 29 characters; 64 leaves room for spaces and rejects junk early.
  if (typeof rules !== 'string' || rules.length > 64) throw new Error('Invalid moderation rules')
  const names = rules.split(',').map(name => name.trim()).filter(Boolean)
  if (names.some(name => !(RULE_ORDER as readonly string[]).includes(name))) throw new Error('Invalid moderation rules')
  return keyOf(Object.fromEntries(RULE_ORDER.map(name => [name, names.includes(name)])) as Record<RuleName, boolean>)
}

/** The optional rules a policy key enables. */
export function moderationRules(policy: ModerationSeverity): ModerationRuleSet {
  if (policy === 'relaxed' || policy === 'standard' || policy === 'strict') return PRESETS[policy]
  const bits = policy.slice('custom:'.length)
  return Object.fromEntries(RULE_ORDER.map((name, i) => [name, bits[i] === '1'])) as unknown as ModerationRuleSet
}

export const isCustomPolicy = (policy: ModerationSeverity): policy is CustomModerationPolicy => policy.startsWith('custom:')

/** Versioned wire object. The SDK forwards it without knowing individual rule names. */
export function versionedModerationPolicy(value: unknown, severity?: unknown, rules?: unknown): ModerationSeverity {
  if (value === undefined || value === null) return moderationPolicy(severity, rules)
  const policy = typeof value === 'string' ? JSON.parse(value) as unknown : value
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw new Error('Invalid moderation policy')
  const p = policy as Record<string, unknown>
  if (p.version !== 1 || !p.rules || typeof p.rules !== 'object' || Array.isArray(p.rules)) throw new Error('Unsupported moderation policy version')
  const selected = p.rules as Record<string, unknown>
  if (Object.keys(selected).some(name => !(RULE_ORDER as readonly string[]).includes(name) || typeof selected[name] !== 'boolean')) throw new Error('Invalid moderation rules')
  const base = moderationSeverity(p.severity)
  const defaults = moderationRules(base)
  return moderationPolicy(base, RULE_ORDER.filter(name => selected[name] === undefined ? defaults[name] : selected[name]).join(','))
}

// Adapted from Gardens V2 apps/web/utils/markeeChallengeStore.ts at 078d17954ad38dba7a142eb3cee59002f44d303f.
import { randomUUID } from 'node:crypto';
const REDIS_REQUEST_TIMEOUT_MS = 5_000;
const KEY_PREFIX = "markee:sdk:authorization";
const ISSUE_WINDOW_SECONDS = 60;
const MAX_GLOBAL_ISSUES_PER_WINDOW = 120;
const MAX_SUBJECT_ISSUES_PER_WINDOW = 12;

type StoredChallenge = {
  expiresAt: number;
  value: unknown;
};

const memoryChallenges = new Map<string, StoredChallenge>();
const memoryIssueCounts = new Map<
  string,
  { count: number; expiresAt: number }
>();

export class MarkeeChallengeStoreUnavailableError extends Error {
  constructor(message = "Markee authorization storage is unavailable.") {
    super(message);
    this.name = "MarkeeChallengeStoreUnavailableError";
  }
}

export class MarkeeChallengeRateLimitError extends Error {
  constructor(message = "Too many Markee authorization requests.") {
    super(message);
    this.name = "MarkeeChallengeRateLimitError";
  }
}

const getRedisConfig = () => {
  const url = (
    process.env.MARKEE_AUTH_REDIS_REST_URL ??
    process.env.KV_REST_API_URL ??
    process.env.UPSTASH_REDIS_REST_URL
  )?.trim();
  const token = (
    process.env.MARKEE_AUTH_REDIS_REST_TOKEN ??
    process.env.KV_REST_API_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN
  )?.trim();

  return url && token ? { token, url: url.replace(/\/$/u, "") } : null;
};

const getKey = (namespace: string, nonce: string) =>
  `${KEY_PREFIX}:${namespace}:${nonce}`;

const serialize = (value: unknown) =>
  JSON.stringify(value, (_key, nestedValue: unknown) =>
    typeof nestedValue === "bigint" ?
      { __gardensMarkeeBigInt: nestedValue.toString() }
    : nestedValue,
  );

const deserialize = <T>(value: string): T =>
  JSON.parse(value, (_key, nestedValue: unknown) => {
    if (
      typeof nestedValue === "object" &&
      nestedValue !== null &&
      Object.keys(nestedValue).length === 1 &&
      "__gardensMarkeeBigInt" in nestedValue &&
      typeof nestedValue.__gardensMarkeeBigInt === "string"
    ) {
      return BigInt(nestedValue.__gardensMarkeeBigInt);
    }
    return nestedValue;
  }) as T;

const redisCommand = async <T>(command: Array<string | number>): Promise<T> => {
  const config = getRedisConfig();
  if (!config) throw new MarkeeChallengeStoreUnavailableError();

  let response: Response;
  try {
    response = await fetch(config.url, {
      body: JSON.stringify(command),
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(REDIS_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new MarkeeChallengeStoreUnavailableError(
      error instanceof Error ? error.message : undefined,
    );
  }

  const body = (await response.json().catch(() => null)) as {
    error?: string;
    result?: T;
  } | null;
  if (!response.ok || body == null || body.error != null) {
    throw new MarkeeChallengeStoreUnavailableError(
      body?.error ?? `Redis returned HTTP ${response.status}.`,
    );
  }
  return body.result as T;
};

const requireDurableStoreInProduction = () => {
  if (process.env.NODE_ENV === "production" && getRedisConfig() == null) {
    throw new MarkeeChallengeStoreUnavailableError();
  }
};

export const saveMarkeeChallenge = async <T>({
  namespace,
  nonce,
  ttlSeconds,
  value,
}: {
  namespace: string;
  nonce: string;
  ttlSeconds: number;
  value: T;
}) => {
  requireDurableStoreInProduction();
  const key = getKey(namespace, nonce);
  const config = getRedisConfig();
  if (config != null) {
    const result = await redisCommand<"OK" | null>([
      "SET",
      key,
      serialize(value),
      "EX",
      ttlSeconds,
      "NX",
    ]);
    if (result !== "OK") {
      throw new MarkeeChallengeStoreUnavailableError(
        "Authorization nonce already exists.",
      );
    }
    return;
  }

  memoryChallenges.set(key, {
    expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
    value,
  });
};

const incrementMemoryIssueCount = (key: string, now: number) => {
  const current = memoryIssueCounts.get(key);
  if (current == null || current.expiresAt <= now) {
    memoryIssueCounts.set(key, {
      count: 1,
      expiresAt: now + ISSUE_WINDOW_SECONDS,
    });
    return 1;
  }
  current.count += 1;
  return current.count;
};

/**
 * Reserves issuance capacity before any RPC or quote work. Redis evaluates the
 * global and per-community counters together so serverless instances cannot
 * independently exhaust upstream provider or storage quotas.
 */
export const reserveMarkeeChallengeIssue = async ({
  namespace,
  subject,
}: {
  namespace: string;
  subject: string;
}) => {
  requireDurableStoreInProduction();
  // The shared hash tag keeps both keys in one Redis Cluster slot so the Lua
  // script stays atomic on clustered providers as well as single-node Redis.
  const globalKey = `${KEY_PREFIX}:rate:{${namespace}}:global`;
  const subjectKey = `${KEY_PREFIX}:rate:{${namespace}}:${subject}`;
  const config = getRedisConfig();

  let allowed: number;
  if (config != null) {
    allowed = await redisCommand<number>([
      "EVAL",
      "local global = redis.call('INCR', KEYS[1]); if global == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; local subject = redis.call('INCR', KEYS[2]); if subject == 1 then redis.call('EXPIRE', KEYS[2], ARGV[1]); end; if global > tonumber(ARGV[2]) or subject > tonumber(ARGV[3]) then return 0; end; return 1",
      2,
      globalKey,
      subjectKey,
      ISSUE_WINDOW_SECONDS,
      MAX_GLOBAL_ISSUES_PER_WINDOW,
      MAX_SUBJECT_ISSUES_PER_WINDOW,
    ]);
  } else {
    const now = Math.floor(Date.now() / 1000);
    const globalCount = incrementMemoryIssueCount(globalKey, now);
    const subjectCount = incrementMemoryIssueCount(subjectKey, now);
    allowed =
      (
        globalCount <= MAX_GLOBAL_ISSUES_PER_WINDOW &&
        subjectCount <= MAX_SUBJECT_ISSUES_PER_WINDOW
      ) ?
        1
      : 0;
  }

  if (allowed !== 1) throw new MarkeeChallengeRateLimitError();
};

const ACTIVATION_WINDOW_SECONDS = 24 * 60 * 60;

export type MarkeeActivationLimit = { subject: string; max: number };
type ActivationReservation = {
  state: 'pending' | 'deployed' | 'reverted';
  completedKeys: string[];
  pendingKeys: string[];
};
const memoryActivationReservations = new Map<string, ActivationReservation>();

/**
 * Reserve capacity in the UTC day without increasing the deployed-board count.
 * Pending capacity prevents concurrent broadcasts overrunning the daily limits.
 * Only a successful receipt commits it; a confirmed revert releases it.
 */
export const reserveMarkeeActivation = async ({
  namespace,
  limits,
}: {
  namespace: string;
  limits: MarkeeActivationLimit[];
}) => {
  requireDurableStoreInProduction();
  const bucket = Math.floor(Date.now() / 1000 / ACTIVATION_WINDOW_SECONDS);
  const keys = limits.map(
    ({ subject }) => `${KEY_PREFIX}:activation:{${namespace}}:${bucket}:${subject}`,
  );
  const pendingKeys = keys.map(key => key.replace(':activation:', ':activation-pending:'));
  const reservationKey = `${KEY_PREFIX}:activation-reservation:{${namespace}}:${randomUUID()}`;
  const reservation: ActivationReservation = { state: 'pending', completedKeys: keys, pendingKeys };
  const config = getRedisConfig();

  let allowed: number;
  if (config != null) {
    allowed = await redisCommand<number>([
      "EVAL",
      "local n = (#KEYS - 1) / 2; for i = 1, n do local used = tonumber(redis.call('GET', KEYS[i]) or '0') + tonumber(redis.call('GET', KEYS[n + i]) or '0'); if used >= tonumber(ARGV[i + 2]) then return 0 end end; for i = 1, n do if redis.call('INCR', KEYS[n + i]) == 1 then redis.call('EXPIRE', KEYS[n + i], ARGV[1]) end end; redis.call('SET', KEYS[#KEYS], ARGV[2], 'EX', ARGV[1]); return 1",
      keys.length * 2 + 1,
      ...keys,
      ...pendingKeys,
      reservationKey,
      ACTIVATION_WINDOW_SECONDS * 2,
      JSON.stringify(reservation),
      ...limits.map(({ max }) => max),
    ]);
  } else {
    const now = Math.floor(Date.now() / 1000);
    const count = (key: string) => {
      const stored = memoryIssueCounts.get(key);
      return stored == null || stored.expiresAt <= now ? 0 : stored.count;
    };
    const current = keys.map((key, i) => count(key) + count(pendingKeys[i]));
    allowed = current.every((count, i) => count < limits[i].max) ? 1 : 0;
    if (allowed === 1) {
      pendingKeys.forEach((key) =>
        memoryIssueCounts.set(key, {
          count: count(key) + 1,
          expiresAt: now + ACTIVATION_WINDOW_SECONDS * 2,
        }),
      );
      memoryActivationReservations.set(reservationKey, reservation);
    }
  }

  if (allowed !== 1) throw new MarkeeChallengeRateLimitError();
  return reservationKey;
};

/** Idempotent receipt settlement, including after an interrupted HTTP request. */
export const finalizeMarkeeActivation = async (reservationKey: string, deployed: boolean) => {
  requireDurableStoreInProduction();
  const config = getRedisConfig();
  const stored = config
    ? await redisCommand<string | null>(['GET', reservationKey])
    : memoryActivationReservations.get(reservationKey);
  if (!stored) return;
  const reservation: ActivationReservation = typeof stored === 'string' ? JSON.parse(stored) : stored;
  if (reservation.state !== 'pending') return;
  const settled = { ...reservation, state: deployed ? 'deployed' : 'reverted' };
  if (config) {
    await redisCommand<number>(['EVAL',
      "local raw = redis.call('GET', KEYS[1]); if not raw or raw ~= ARGV[4] then return 0 end; local n = (#KEYS - 1) / 2; for i = 1, n do local pending = KEYS[1 + n + i]; if tonumber(redis.call('GET', pending) or '0') > 0 then redis.call('DECR', pending) end; if ARGV[1] == '1' then if redis.call('INCR', KEYS[1 + i]) == 1 then redis.call('EXPIRE', KEYS[1 + i], ARGV[2]) end end end; redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[2]); return 1",
      1 + reservation.completedKeys.length * 2, reservationKey,
      ...reservation.completedKeys, ...reservation.pendingKeys,
      deployed ? 1 : 0, ACTIVATION_WINDOW_SECONDS * 2, JSON.stringify(settled), stored as string,
    ]);
  } else {
    const now = Math.floor(Date.now() / 1000);
    reservation.pendingKeys.forEach(key => {
      const old = memoryIssueCounts.get(key);
      if (old) old.count = Math.max(0, old.count - 1);
    });
    if (deployed) reservation.completedKeys.forEach(key => {
      const old = memoryIssueCounts.get(key);
      memoryIssueCounts.set(key, { count: (old && old.expiresAt > now ? old.count : 0) + 1, expiresAt: now + ACTIVATION_WINDOW_SECONDS * 2 });
    });
    memoryActivationReservations.set(reservationKey, settled as ActivationReservation);
  }
};

export const consumeMarkeeChallenge = async <T>({
  namespace,
  nonce,
}: {
  namespace: string;
  nonce: string;
}): Promise<T | null> => {
  requireDurableStoreInProduction();
  const key = getKey(namespace, nonce);
  const config = getRedisConfig();
  if (config != null) {
    // Redis EVAL keeps read-and-delete atomic on providers that predate GETDEL.
    const serialized = await redisCommand<string | null>([
      "EVAL",
      "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
      1,
      key,
    ]);
    return serialized == null ? null : deserialize<T>(serialized);
  }

  const stored = memoryChallenges.get(key);
  memoryChallenges.delete(key);
  if (stored == null || stored.expiresAt <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  return stored.value as T;
};

export const clearMarkeeChallengesForTests = (namespace?: string) => {
  if (process.env.NODE_ENV !== "test") return;
  const namespacePrefix =
    namespace == null ? `${KEY_PREFIX}:` : `${KEY_PREFIX}:${namespace}:`;
  for (const key of memoryChallenges.keys()) {
    if (key.startsWith(namespacePrefix)) memoryChallenges.delete(key);
  }
  for (const key of memoryIssueCounts.keys()) {
    if (key.startsWith(`${KEY_PREFIX}:rate:`) || key.startsWith(`${KEY_PREFIX}:activation:`) || key.startsWith(`${KEY_PREFIX}:activation-pending:`)) {
      memoryIssueCounts.delete(key);
    }
  }
  memoryActivationReservations.clear();
};

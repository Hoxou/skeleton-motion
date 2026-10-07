export const TIER_TIMEOUT_MS = 14_000;
// A session is two bounded steps (launch, then load and measure).
const SESSION_MAX_MS = 2 * TIER_TIMEOUT_MS;
// Worst-case browser time one lookup can spend: quick action plus session.
// Reserving it before starting keeps the caps from overshooting.
export const RESERVE_MS = TIER_TIMEOUT_MS + SESSION_MAX_MS;
export const COOLDOWN_MS = 10 * 60_000;

export function readLimits(env) {
  return {
    dailyMs: Number(env.BROWSER_DAILY_MS) || 0,
    enabled: env.BROWSER_LOOKUPS === "on",
    monthlyMs: Number(env.BROWSER_MONTHLY_MS) || 0,
    sessions: env.BROWSER_SESSIONS === "on",
  };
}

export function periodKeys(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  return { day, dayKey: `ms:${day}`, lookupsKey: `lookups:${month}`, month, monthKey: `ms:${month}` };
}

export function fits(usage, limits, extraMs) {
  return usage.dayMs + extraMs <= limits.dailyMs && usage.monthMs + extraMs <= limits.monthlyMs;
}

/** Returns the reason a new lookup must not start, or null when it may. */
export function refusal(usage, limits, now = Date.now()) {
  if (!limits.enabled) return "disabled";
  if (usage.cooldownUntil > now) return "cooldown";
  if (!fits(usage, limits, RESERVE_MS)) return "budget";
  return null;
}

/** Whether the session tier may follow a quick action that spent `spentMs`. */
export function allowsSession(usage, limits, spentMs) {
  return limits.sessions && fits(usage, limits, spentMs + SESSION_MAX_MS);
}

/** Storage writes that record one finished lookup. */
export function chargeEntries(usage, ms, now = new Date()) {
  const keys = periodKeys(now);
  return {
    [keys.dayKey]: usage.dayMs + ms,
    [keys.lookupsKey]: usage.lookupsThisMonth + 1,
    [keys.monthKey]: usage.monthMs + ms,
  };
}

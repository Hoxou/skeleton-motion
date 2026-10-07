import { parseProbe, PROBE_VERSION } from "./brand-probe.js";

const OK_TTL_MS = 30 * 86_400_000;
const EMPTY_TTL_MS = 86_400_000;
// Only real outcomes are cached; capacity skips must retry next time.
const CACHEABLE_SKIPS = new Set(["error", "no-result"]);

async function cached(env, host) {
  const row = await env.DB.prepare("SELECT status, probe, measured_at FROM site_styles WHERE host = ?").bind(host).first();
  if (!row) return null;
  const age = Date.now() - Date.parse(row.measured_at);
  if (age > (row.status === "ok" ? OK_TTL_MS : EMPTY_TTL_MS)) return null;
  // Measurements from an older probe are taken again, so a change to what
  // the probe measures reaches sites already in the cache.
  if (row.status === "ok" && (() => { try { return JSON.parse(row.probe).version !== PROBE_VERSION; } catch { return true; } })()) return null;
  return { probe: row.status === "ok" ? parseProbe(row.probe) : null };
}

async function remember(env, host, result) {
  const status = result.probe ? "ok" : "empty";
  await env.DB.prepare(
    "INSERT INTO site_styles (host, status, probe, via, browser_ms, measured_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (host) DO UPDATE SET status = excluded.status, probe = excluded.probe, via = excluded.via, browser_ms = excluded.browser_ms, measured_at = excluded.measured_at",
  ).bind(host, status, result.probe ? JSON.stringify(result.probe) : null, result.via || null, Math.round(result.ms || 0), new Date().toISOString()).run();
}

/**
 * Measured brand styles for a page, from the per-host cache or one gated
 * Browser Run lookup. Returns `{ probe, source }`; `probe` is null whenever
 * the browser is unavailable, over budget, or found nothing.
 */
export async function measureBrand(env, url, { needsContent = false } = {}) {
  const host = url.host.toLowerCase();
  const hit = await cached(env, host);
  // Entries measured before page text was captured cannot serve a thin page.
  if (hit && !(needsContent && hit.probe && !hit.probe.content)) return { probe: hit.probe, source: "cache" };
  const gate = env.BROWSER_GATE.get(env.BROWSER_GATE.idFromName("global"));
  const result = await gate.measure(url.href);
  if (result.probe || CACHEABLE_SKIPS.has(result.skipped)) await remember(env, host, result);
  return { probe: result.probe || null, source: result.probe ? result.via : `skipped:${result.skipped}` };
}

export async function browserUsage(env) {
  return env.BROWSER_GATE.get(env.BROWSER_GATE.idFromName("global")).usage();
}

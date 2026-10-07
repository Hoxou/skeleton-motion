import { DurableObject } from "cloudflare:workers";
import puppeteer from "@cloudflare/puppeteer";
import { parseProbe, PROBE_EXPRESSION, PROBE_SCRIPT, readProbe } from "./brand-probe.js";
import { allowsSession, chargeEntries, COOLDOWN_MS, periodKeys, readLimits, refusal, TIER_TIMEOUT_MS } from "./budget.js";
import { logError } from "./log.js";

const WAIT_FOR_BUSY_MS = 9_000;
const GOTO = { timeout: 12_000, waitUntil: "load" };
const BLOCKED_TYPES = ["image", "media", "font"];

function deadline(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * The only path from Skeleton Motion to Browser Run. A single instance
 * (`idFromName("global")`) runs one lookup at a time and enforces the daily
 * and monthly browser-time caps from wrangler vars, because the Browser Run
 * allowance is shared with every other Worker on the account.
 */
export class BrowserGate extends DurableObject {
  inflight = null;

  async usage() {
    const keys = periodKeys();
    const stored = await this.ctx.storage.get([keys.dayKey, keys.monthKey, keys.lookupsKey, "cooldownUntil"]);
    return {
      cooldownUntil: stored.get("cooldownUntil") || 0,
      day: keys.day,
      dayMs: stored.get(keys.dayKey) || 0,
      lookupsThisMonth: stored.get(keys.lookupsKey) || 0,
      month: keys.month,
      monthMs: stored.get(keys.monthKey) || 0,
      ...readLimits(this.env),
    };
  }

  /**
   * Returns `{ probe, via, ms }` on success or `{ skipped }` with the reason.
   * Never throws: callers fall back to static analysis.
   */
  async measure(url) {
    if (this.inflight) await deadline(this.inflight, WAIT_FOR_BUSY_MS, "wait").catch(() => {});
    if (this.inflight) return { skipped: "busy" };
    // Claim the slot before any await so two waiters cannot both start.
    this.inflight = this.start(url).finally(() => { this.inflight = null; });
    return this.inflight;
  }

  async start(url) {
    const usage = await this.usage();
    const reason = refusal(usage, usage);
    return reason ? { skipped: reason } : this.run(url, usage);
  }

  async run(url, usage) {
    let spent = 0;
    // A tier that throws or times out still used the browser; bill its wall time.
    const tier = async (call) => {
      const started = Date.now();
      try {
        const result = await call();
        spent += result.ms;
        return result;
      } catch (error) {
        spent += Date.now() - started;
        throw error;
      }
    };
    try {
      const quick = await tier(() => this.quickAction(url));
      if (quick.status === 429) return await this.coolDown();
      if (quick.probe) return { ms: spent, probe: quick.probe, via: "quick-action" };
      // Strict-CSP pages block the injected script; only a session can
      // evaluate outside the page's CSP.
      if (!allowsSession(usage, usage, spent)) return { ms: spent, skipped: "no-result" };
      const session = await tier(() => this.session(url));
      return session.probe ? { ms: spent, probe: session.probe, via: "session" } : { ms: spent, skipped: "no-result" };
    } catch (error) {
      if (/429|too many/i.test(error.message)) return await this.coolDown();
      logError({ error: error.message, message: "browser lookup failed", url });
      return { error: error.message, ms: spent, skipped: "error" };
    } finally {
      await this.ctx.storage.put(chargeEntries(await this.usage(), spent));
    }
  }

  async coolDown() {
    await this.ctx.storage.put("cooldownUntil", Date.now() + COOLDOWN_MS);
    return { skipped: "rate-limited" };
  }

  async quickAction(url) {
    const started = Date.now();
    const response = await deadline(this.env.BROWSER.quickAction("content", {
      addScriptTag: [{ content: PROBE_SCRIPT }],
      gotoOptions: GOTO,
      rejectResourceTypes: BLOCKED_TYPES,
      url,
    }), TIER_TIMEOUT_MS, "quick action");
    const ms = Number(response.headers.get("x-browser-ms-used")) || Date.now() - started;
    if (!response.ok) return { ms, probe: null, status: response.status };
    const body = await response.json().catch(() => null);
    return { ms, probe: readProbe(body?.result), status: response.status };
  }

  async session(url) {
    const started = Date.now();
    const browser = await deadline(puppeteer.launch(this.env.BROWSER), TIER_TIMEOUT_MS, "session launch");
    try {
      const page = await browser.newPage();
      await page.setBypassCSP(true);
      await page.setRequestInterception(true);
      page.on("request", (request) => (BLOCKED_TYPES.includes(request.resourceType()) ? request.abort() : request.continue()));
      const raw = await deadline((async () => {
        await page.goto(url, GOTO);
        return page.evaluate(PROBE_EXPRESSION);
      })(), TIER_TIMEOUT_MS, "session");
      return { ms: Date.now() - started, probe: parseProbe(raw) };
    } finally {
      // Closing immediately stops billing; an unclosed browser idles for 60 s.
      await browser.close();
    }
  }
}

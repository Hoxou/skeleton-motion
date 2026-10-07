import assert from "node:assert/strict";
import test from "node:test";
import { parseProbe, probeToCss, readProbe } from "../worker/brand-probe.js";
import { allowsSession, chargeEntries, readLimits, refusal, RESERVE_MS } from "../worker/budget.js";

const limits = readLimits({ BROWSER_DAILY_MS: "180000", BROWSER_LOOKUPS: "on", BROWSER_MONTHLY_MS: "1800000", BROWSER_SESSIONS: "on" });
const idle = { cooldownUntil: 0, dayMs: 0, lookupsThisMonth: 0, monthMs: 0 };

test("a fresh day and month may start a lookup", () => {
  assert.equal(refusal(idle, limits), null);
});

test("refuses a lookup whose worst case would cross the daily cap", () => {
  assert.equal(refusal({ ...idle, dayMs: limits.dailyMs - RESERVE_MS + 1 }, limits), "budget");
  assert.equal(refusal({ ...idle, dayMs: limits.dailyMs - RESERVE_MS }, limits), null);
});

test("refuses a lookup whose worst case would cross the monthly cap", () => {
  assert.equal(refusal({ ...idle, monthMs: limits.monthlyMs - RESERVE_MS + 1 }, limits), "budget");
});

test("the kill switch and missing caps refuse every lookup", () => {
  assert.equal(refusal(idle, { ...limits, enabled: false }), "disabled");
  assert.equal(refusal(idle, readLimits({ BROWSER_LOOKUPS: "on" })), "budget");
});

test("a recent rate limit pauses lookups until the cooldown ends", () => {
  const now = 1_000_000;
  assert.equal(refusal({ ...idle, cooldownUntil: now + 1 }, limits, now), "cooldown");
  assert.equal(refusal({ ...idle, cooldownUntil: now }, limits, now), null);
});

test("the session tier needs its own room in the budget and its switch on", () => {
  assert.equal(allowsSession(idle, limits, 2_000), true);
  assert.equal(allowsSession({ ...idle, dayMs: limits.dailyMs - 10_000 }, limits, 2_000), false);
  assert.equal(allowsSession(idle, { ...limits, sessions: false }, 2_000), false);
});

test("charging adds spent time to the day and month and counts the lookup", () => {
  const entries = chargeEntries({ ...idle, dayMs: 500, lookupsThisMonth: 3, monthMs: 9_000 }, 1_200, new Date("2026-10-06T10:00:00Z"));
  assert.deepEqual(entries, { "lookups:2026-10": 4, "ms:2026-10": 10_200, "ms:2026-10-06": 1_700 });
});

test("keeps only safe values from an untrusted probe", () => {
  const probe = parseProbe(JSON.stringify({
    accent: "#5E6AD2",
    background: "red; } body { display:none",
    fontBody: "__Inter_d65c78, __Inter_Fallback_d65c78, system-ui",
    fontHeading: "</style><script>alert(1)</script>",
    foreground: "#171717",
    radius: "9999px",
  }));
  assert.equal(probe.accent, "#5e6ad2");
  assert.equal(probe.background, null);
  assert.equal(probe.fontBody, '"Inter", system-ui');
  assert.doesNotMatch(probe.fontHeading, /[<>{};]/);
  assert.equal(probe.radius, "48px");
});

test("treats a probe with neither color nor font as no result", () => {
  assert.equal(parseProbe(JSON.stringify({ background: "#ffffff" })), null);
  assert.equal(parseProbe("not json"), null);
  assert.equal(readProbe("<html>no marker</html>"), null);
});

test("reads the marker the content quick action leaves in rendered HTML", () => {
  const html = '<html><script type="application/json" id="__skeleton_motion_brand">{"accent":"#0072f5","fontBody":"Geist"}</script></html>';
  assert.equal(readProbe(html).accent, "#0072f5");
});

test("a light page fills the light theme with contrast-safe surfaces", () => {
  const css = probeToCss({ accent: "#533afd", background: "#ffffff", fontBody: "sohne-var, sans-serif", fontHeading: null, foreground: "#000000", radius: "4px" });
  assert.match(css, /^:root \{ --primary: #533afd; --radius: 4px; --background: #ffffff; --foreground: #000000; --card: #ffffff; --muted: #f2f2f2; --border: #e0e0e0;/);
  assert.doesNotMatch(css, /\.dark/);
  assert.match(css, /body \{ font-family: sohne-var, sans-serif; \}/);
});

test("a dark page fills the dark theme so the light variant is derived", () => {
  const css = probeToCss({ accent: "#5e6ad2", background: "#08090a", fontBody: null, fontHeading: "Inter", foreground: "#f7f8f8", radius: null });
  assert.match(css, /^:root \{ --primary: #5e6ad2; \}/);
  assert.match(css, /\.dark \{ --background: #08090a; --foreground: #f7f8f8; --card: #161718;/);
});

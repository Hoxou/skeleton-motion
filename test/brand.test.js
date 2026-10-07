import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSource } from "../src/analyze.js";
import { parseArgs } from "../src/args.js";
import { generateCollection } from "../src/generate.js";
import { validatePlan } from "../src/scene-plan.js";
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

test("keeps only well-formed color coverage from a probe", () => {
  const probe = parseProbe(JSON.stringify({ accent: "#635bff", shares: [["#635BFF", 0.6], ["red", 0.2], ["#ffd601", 0.3], ["#00d4ff", 2], ["#ee30fb", -1], "#000000", ["#ff5996", 0.1]] }));
  assert.deepEqual(probe.shares, [["#635bff", 0.6], ["#ffd601", 0.3], ["#ff5996", 0.1]]);
});

test("a colorful brand's measured colors reach the marks of a designed story", async () => {
  const page = "<html><head><title>Payments</title></head><body><main><h1>Payments</h1></main></body></html>";
  const fetch = async () => new Response(page, { headers: { "content-type": "text/html" } });
  const measuredCss = probeToCss({ accent: "#635bff", background: "#ffffff", foreground: "#0a2540", shares: [["#635bff", 0.5], ["#00d4ff", 0.3], ["#ff5996", 0.2]] });
  const analysis = await analyzeSource("https://pay.example/", { fetch, measuredCss });
  assert.equal(analysis.palettes.light.colorMode, "multicolor");
  assert.deepEqual(analysis.palettes.light.accents, ["#635bff", "#00d4ff", "#ff5996"]);
  assert.deepEqual(analysis.palettes.light.shares, [0.5, 0.3, 0.2]);

  const plan = validatePlan({
    copy: { title: "Get paid" },
    elements: { ana: { kind: "avatar", tone: "tag-2" }, list: { kind: "panel" }, paid: { kind: "chip", label: "Paid", tone: "tag-2" } },
    label: "Payment lands",
    states: [{ layout: { children: ["ana"], id: "list", type: "panel" } }, { highlight: ["paid"], layout: { children: ["ana", "paid"], id: "list", type: "panel" } }],
  }, { driver: "system" }).plan;
  const options = parseArgs(["https://pay.example/", "--set", "--name", "pay"], "/");
  const svg = generateCollection(analysis, options, { stories: [{ copy: plan.copy, id: "pay", label: plan.label, plan }] }).files.find((file) => file.name.endsWith(".light.svg")).data;
  assert.match(svg, /--mark-2: #00d4ff;/);
  assert.match(svg, /data-plan-id="ana"[^]*?<circle [^>]*fill="var\(--mark-2\)"/);
  assert.match(svg, /data-plan-id="paid"[^]*?<rect [^>]*fill="var\(--tag-2\)"/);
});

test("a cached probe from before color coverage was measured is measured again", async () => {
  const { measureBrand } = await import("../worker/brand.js");
  const fresh = { accent: "#635bff", shares: [["#00d4ff", 1]] };
  const envFor = (probe) => {
    const measured = [];
    return {
      BROWSER_GATE: { get: () => ({ measure: async (href) => { measured.push(href); return { ms: 1, probe: fresh, via: "session" }; } }), idFromName: () => "global" },
      DB: { prepare: () => ({ bind: () => ({ first: async () => ({ measured_at: new Date().toISOString(), probe: JSON.stringify(probe), status: "ok" }), run: async () => ({}) }) }) },
      measured,
    };
  };
  const old = envFor({ accent: "#635bff", background: "#ffffff" });
  assert.equal((await measureBrand(old, new URL("https://pay.example/"))).source, "session");
  assert.equal(old.measured.length, 1);
  const current = envFor({ accent: "#635bff", shares: [] });
  assert.equal((await measureBrand(current, new URL("https://pay.example/"))).source, "cache");
  assert.equal(current.measured.length, 0);
});

test("only real colors become accents", async () => {
  const css = ":root { --primary: #1877f2; --status-success: #31a24c; --status-filter: invert(77%) sepia(29%) saturate(200%); --chart-blue: hsl(214, 89%, 52%); --chart-ramp: linear-gradient(red, blue); }";
  const html = `<html><head><title>x</title><style>${css}</style></head><body><i style="color: var(--status-success)"></i><i style="filter: var(--status-filter)"></i><i style="color: var(--chart-blue)"></i><i style="background: var(--chart-ramp)"></i></body></html>`;
  const analysis = await analyzeSource("https://social.example/", { fetch: async () => new Response(html) });
  // hsl(214, 89%, 52%) is the primary's own blue, so it adds share, not an accent.
  assert.deepEqual(analysis.palettes.light.accents, ["#1877f2", "#31a24c"]);
});

test("brand hues come from stylesheets and the site's own logo, not customer logos", async () => {
  const css = ".hero { background: #ffd601 } .tag { color: #ee30fb } .tag-b { color: #ee30fb } .muted { color: #972121 } .soft { background: #e6f6e9 }";
  const html = `<html><head><title>x</title><style>:root { --primary: #635bff; } ${css}</style></head><body>
    <header><a href="/"><svg><path fill="#24cb71"/></svg></a><nav><svg><path fill="#e01e5a"/></svg></nav></header>
    <section class="logos"><svg><path fill="#34a853"/><path fill="#34a853"/><path fill="#34a853"/></svg></section></body></html>`;
  const analysis = await analyzeSource("https://pay.example/", { fetch: async () => new Response(html) });
  const accents = analysis.palettes.light.accents;
  assert.equal(accents[0], "#635bff");
  assert.ok(accents.includes("#ffd601") && accents.includes("#ee30fb") && accents.includes("#24cb71"), accents.join(" "));
  for (const noise of ["#34a853", "#e01e5a", "#972121", "#e6f6e9"]) assert.ok(!accents.includes(noise), `${noise} is not a brand hue`);
  assert.equal(analysis.palettes.light.colorMode, "multicolor");
});

test("stylesheets on a CDN host count toward the palette", async () => {
  const html = '<html><head><title>x</title><link href="https://cdn.example/site.css" rel="stylesheet"><style>:root { --primary: #635bff; }</style></head><body></body></html>';
  const fetched = [];
  const fetch = async (url) => {
    fetched.push(String(url));
    return new Response(String(url).endsWith(".css") ? ".a { color: #ffd601 } .b { color: #ee30fb } .c { color: #00d4ff }" : html);
  };
  const analysis = await analyzeSource("https://pay.example/", { fetch });
  assert.ok(fetched.includes("https://cdn.example/site.css"));
  assert.equal(analysis.palettes.light.accents.length, 4);
});

test("measured coverage decides the main color and when a brand reads as one color", async () => {
  const page = "<html><head><title>x</title></head><body></body></html>";
  const fetch = async () => new Response(page);
  const mono = await analyzeSource("https://one.example/", { fetch, measuredCss: probeToCss({ accent: "#635bff", shares: [["#635bff", 0.93], ["#ffd601", 0.07]] }) });
  assert.equal(mono.palettes.light.colorMode, "monochrome");
  const mixed = await analyzeSource("https://two.example/", { fetch, measuredCss: probeToCss({ shares: [["#ffd601", 0.66], ["#8a5a2b", 0.0], ["#ff6118", 0.02], ["#00a3ff", 0.32]] }) });
  assert.equal(mixed.palettes.light.accent, "#ffd601", "with no brand token the most used color leads");
  assert.deepEqual(mixed.palettes.light.accents, ["#ffd601", "#00a3ff"]);
  assert.equal(mixed.palettes.light.colorMode, "multicolor");
});

test("untoned marks are shades of the main color, checks green, crosses red", async () => {
  const page = "<html><head><title>x</title></head><body></body></html>";
  const render = async (shares) => {
    const analysis = await analyzeSource("https://pay.example/", { fetch: async () => new Response(page), measuredCss: probeToCss({ accent: "#635bff", shares }) });
    const plan = validatePlan({
      elements: { a: { kind: "row" }, b: { kind: "row", tone: "tag-2" }, list: { kind: "panel" } },
      screen: { children: ["a", "b"], id: "list", type: "panel" },
      steps: [{ do: [{ id: "a", op: "set", state: "done" }] }, { do: [{ id: "b", op: "set", state: "error" }] }],
    }, { driver: "system" }).plan;
    const options = parseArgs(["https://pay.example/", "--set", "--name", "pay"], "/");
    return generateCollection(analysis, options, { stories: [{ copy: plan.copy, id: "pay", label: plan.label, plan }] }).files.find((file) => file.name.endsWith(".light.svg")).data;
  };
  const branded = await render([["#635bff", 0.6], ["#1aae39", 0.4]]);
  assert.match(branded, /--shade-1: #635bff;/);
  assert.match(branded, /--success: #1aae39;/, "the brand's own green marks success");
  assert.match(branded, /--danger: #e5484d;/, "a standard red when the brand has none");
  assert.match(branded, /data-plan-id="a"[^]*?<circle [^>]*fill="var\(--shade-1\)"/);
  assert.match(branded, /data-plan-id="b"[^]*?<circle [^>]*fill="var\(--mark-2\)"/);
  const mono = await render([["#635bff", 1]]);
  assert.match(mono, /--mark-1: #635bff;/, "a one-color brand's marks are full strength");
});

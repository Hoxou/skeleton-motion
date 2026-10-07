#!/usr/bin/env node
// Runs the hosted brand probe in a local Chromium and prints the palette the
// analyzer derives from it: main color, the other hues, and each one's share
// of the page. For checking color decisions on real sites.
//
//   node scripts/probe-brand.mjs https://stripe.com/ [more urls...]

import { chromium } from "playwright-core";
import { PROBE_EXPRESSION, parseProbe, probeToCss } from "../worker/brand-probe.js";
import { analyzeSource } from "../src/analyze.js";
const browser = await chromium.launch();
for (const url of process.argv.slice(2)) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(url, { timeout: 30000, waitUntil: "load" });
    await page.waitForTimeout(1500);
    const started = Date.now();
    const probe = parseProbe(await page.evaluate(PROBE_EXPRESSION));
    const ms = Date.now() - started;
    const a = await analyzeSource(url, { fetch: (x, init) => fetch(x, { ...init, headers: { "user-agent": "Mozilla/5.0 Chrome/140" } }), measuredCss: probeToCss(probe) });
    const l = a.palettes.light;
    console.log(url.padEnd(26), `${ms}ms`, "accent", probe.accent, "|", l.colorMode, l.accents.map((c, i) => `${c} ${Math.round(l.shares[i] * 100)}%`).join("  "));
    console.log("   raw top:", probe.shares.slice(0, 8).map(([c, w]) => `${c}:${(w * 100).toFixed(1)}`).join(" "));
  } catch (e) { console.log(url, e.message.split("\n")[0]); }
  await page.close();
}
await browser.close();

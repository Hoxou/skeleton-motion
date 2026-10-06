#!/usr/bin/env node
// Writes recolored copies of the homepage motion assets into
// website/static/img/landing/. The originals in examples/ stay untouched
// because they are the CLI's real output for this repo.
//
// Generated SVGs derive every accent token (including the dark-theme tint)
// from one base hex, so swapping that hex recolors the whole asset.
// The dark variant is derived from the same hex, so only light values apply.
// Re-run after regenerating the example sets.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE_COLORS } from "./site-palette.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "website/static/img/landing");
const SOURCE_ACCENT = "#4f46e5";

const ASSETS = [
  { source: "examples/skeleton-motion-set/skeleton-motion-site-set.select-item", name: "select-item", tint: "indigo" },
  { source: "examples/skeleton-motion-set/skeleton-motion-site-set.insert-step", name: "insert-step", tint: "yolk" },
  { source: "examples/skeleton-motion-set/skeleton-motion-site-set.progress-signal", name: "progress-signal", tint: "green" },
];

async function tint({ source, name, tint: tintName }, theme) {
  const svg = await fs.readFile(path.join(ROOT, `${source}.${theme}.svg`), "utf8");
  if (!svg.includes(SOURCE_ACCENT)) {
    throw new Error(`${source}.${theme}.svg no longer uses ${SOURCE_ACCENT}; update SOURCE_ACCENT.`);
  }
  const outFile = path.join(OUT_DIR, `${name}.${theme}.svg`);
  await fs.writeFile(outFile, svg.replaceAll(SOURCE_ACCENT, SITE_COLORS.light[tintName]));
  return path.relative(ROOT, outFile);
}

await fs.mkdir(OUT_DIR, { recursive: true });
for (const asset of ASSETS) {
  for (const theme of ["light", "dark"]) {
    console.log(`wrote ${await tint(asset, theme)}`);
  }
}

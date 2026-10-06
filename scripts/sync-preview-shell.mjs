#!/usr/bin/env node
// Turns the Vite build of the Display Room (tools/preview-shell/dist) into
// one self-contained src/preview-shell.html: the JS bundle and stylesheet
// are inlined, so the CLI can ship the room as a single file with no
// server. src/preview.js only fills the ROOM_DATA marker per run.
//
// Run via `npm run build:preview-shell`. Never hand-edit the output.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "tools/preview-shell/dist");
const OUT_FILE = path.join(ROOT, "src/preview-shell.html");

const read = (relative) => fs.readFile(path.join(DIST, relative), "utf8");

let html = await read("index.html");

const scripts = [...html.matchAll(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/g)];
const styles = [...html.matchAll(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/g)];
if (scripts.length !== 1 || styles.length !== 1) {
  throw new Error(`Expected one script and one stylesheet in the build, found ${scripts.length} and ${styles.length}. Check tools/preview-shell/vite.config.js.`);
}

// "</script" inside the bundle would end the inline element early; "<\/"
// means the same thing in every JS context it can appear in.
const js = (await read(scripts[0][1])).replace(/<\/script/gi, "<\\/script");
const css = await read(styles[0][1]);
html = html
  .replace(scripts[0][0], () => `<script type="module">${js}</script>`)
  .replace(styles[0][0], () => `<style>${css}</style>`);

if ((html.match(/<!--ROOM_DATA-->/g) || []).length !== 1) throw new Error("ROOM_DATA marker must appear exactly once. Check tools/preview-shell/index.html.");
if (/<script[^>]+src=|<link[^>]+rel="stylesheet"/.test(html)) throw new Error("The shell still links an external script or stylesheet.");
if (/url\((?!["']?data:)/.test(css)) throw new Error("The stylesheet references an external file; it must be inlined. Check build.assetsInlineLimit.");

await fs.writeFile(OUT_FILE, html);
console.log(`Synced ${path.relative(ROOT, DIST)} -> ${path.relative(ROOT, OUT_FILE)} (${Math.round(html.length / 1024)} KB)`);

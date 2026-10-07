#!/usr/bin/env node
// Renders one scene plan (steps or states JSON) to SVGs in every frame
// shape, for reviewing engine or prompt changes without a model call.
//
//   node scripts/render-plan.mjs plan.json out-dir [--system] [--accents #0d99ff,#24cb71,#ff7237,#a259ff]
//
// Accents are the brand's hues, main one first; the default is a colorful
// brand so multicolor rendering is what gets reviewed.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeSource } from "../src/analyze.js";
import { parseArgs } from "../src/args.js";
import { generateCollection } from "../src/generate.js";
import { validatePlan } from "../src/scene-plan.js";

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args.splice(index, name === "system" ? 1 : 2).slice(1)[0] ?? true : null;
};
const driver = flag("system") ? "system" : "user";
const accents = String(flag("accents") || "#0d99ff,#24cb71,#ff7237,#a259ff").split(",");
const [input, out] = args;
if (!input || !out) {
  console.error("usage: render-plan.mjs plan.json out-dir [--system] [--accents a,b,c]");
  process.exit(1);
}

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sm-render-"));
await fs.mkdir(path.join(dir, "app"));
const measured = accents.slice(1).map((hex, index) => `--measured-accent-${index + 1}: ${hex};`).join(" ");
await fs.writeFile(path.join(dir, "app", "globals.css"), `:root { --primary: ${accents[0]}; --background: #ffffff; --radius: 10px; ${measured} } .dark { --background: #0b0d12; --foreground: #f5f6f8; }`);
await fs.writeFile(path.join(dir, "app", "page.tsx"), "export default function Page() { return null; }");
const analysis = await analyzeSource(dir);
await fs.rm(dir, { force: true, recursive: true });

const result = validatePlan(JSON.parse(await fs.readFile(input, "utf8")), { driver });
if (!result.ok) {
  console.error(result.errors.join("\n"));
  process.exit(1);
}
const { plan } = result;
const files = generateCollection(analysis, parseArgs([analysis.source.input, "--set", "--name", "plan"], "/"), { stories: [{ copy: plan.copy, id: "story", label: plan.label, plan }] }).files;
await fs.mkdir(out, { recursive: true });
const svgs = files.filter((file) => file.name.endsWith(".svg"));
await Promise.all(svgs.map((file) => fs.writeFile(path.join(out, file.name), file.data)));
console.log(svgs.map((file) => path.join(out, file.name)).join("\n"));

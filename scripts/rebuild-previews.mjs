#!/usr/bin/env node
// Re-renders every examples/*/*.preview.html from its manifest after a
// Display Room change, without re-analyzing the source or touching the
// SVGs. Usage: node scripts/rebuild-previews.mjs [examples-dir]
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderPreview } from "../src/preview.js";
import { previewInputFromManifest } from "../src/room-data.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES = path.resolve(process.argv[2] || path.join(ROOT, "examples"));
const exists = (file) => fs.access(file).then(() => true, () => false);

for (const entry of await fs.readdir(EXAMPLES, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = path.join(EXAMPLES, entry.name);
  for (const file of (await fs.readdir(dir)).filter((name) => name.endsWith(".manifest.json"))) {
    const input = previewInputFromManifest(JSON.parse(await fs.readFile(path.join(dir, file), "utf8")), file);
    if (input.fontFile && !(await exists(path.join(dir, input.fontFile)))) input.fontFile = undefined;
    await fs.writeFile(path.join(dir, input.previewFile), renderPreview(input));
    console.log(`  ${path.relative(ROOT, path.join(dir, input.previewFile))}`);
  }
}

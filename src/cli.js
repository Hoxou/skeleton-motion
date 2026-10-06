import fs from "node:fs/promises";
import path from "node:path";
import { analyzeSource } from "./analyze.js";
import { HELP, parseArgs } from "./args.js";
import { exportMedia } from "./export-media.js";
import { planScene } from "./plan.js";
import { renderPreview } from "./preview.js";
import { renderSvg } from "./render-svg.js";
import { slugify } from "./utils.js";

export async function run(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(HELP.trim());
    return;
  }

  console.log(`Analyzing ${options.source}`);
  const analysis = await analyzeSource(options.source);
  const themes = options.theme === "auto" ? ["light", "dark"] : [options.theme];
  const concept = options.concept === "auto" ? analysis.concepts.ranked[0]?.kind || "flow" : options.concept;
  const assetName = slugify(options.name || `${analysis.slug}-${concept}`);
  await fs.mkdir(options.out, { recursive: true });

  const scenes = [];
  const svgByTheme = new Map();
  for (const theme of themes) {
    const scene = planScene(analysis, { ...options, name: assetName }, theme);
    const svg = renderSvg(scene);
    const file = `${assetName}.${theme}.svg`;
    svgByTheme.set(theme, svg);
    if (options.formats.includes("svg") || options.formats.includes("html")) {
      await fs.writeFile(path.join(options.out, file), svg);
    }
    scenes.push({ ...scene, file });
  }

  if (options.formats.includes("html")) {
    await fs.writeFile(path.join(options.out, `${assetName}.preview.html`), renderPreview({ name: assetName, scenes }));
  }

  for (const format of options.formats.filter((item) => ["gif", "webm", "mp4"].includes(item))) {
    for (const scene of scenes) {
      const output = path.join(options.out, `${assetName}.${scene.theme}.${format}`);
      console.log(`Exporting ${path.basename(output)}`);
      await exportMedia(svgByTheme.get(scene.theme), scene, format, output);
    }
  }

  const manifest = {
    analysis: {
      concepts: analysis.concepts,
      name: analysis.name,
      palettes: analysis.palettes,
      source: analysis.source,
    },
    asset: {
      concept,
      name: assetName,
      oneAssetPerRun: true,
      variants: scenes.map(({ evidence, file, motion, motionProfile, palette, theme, viewport }) => ({ evidence, file, motion, motionProfile, palette, theme, viewport })),
    },
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
  };
  await fs.writeFile(path.join(options.out, `${assetName}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Generated 1 asset (${concept}) in ${options.out}`);
  for (const scene of scenes) console.log(`  ${scene.theme}: ${scene.file}`);
  if (options.formats.includes("html")) console.log(`  preview: ${assetName}.preview.html`);
}

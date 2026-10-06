import fs from "node:fs/promises";
import path from "node:path";
import { analyzeSource } from "./analyze.js";
import { HELP, parseArgs } from "./args.js";
import { exportMedia } from "./export-media.js";
import { planScene } from "./plan.js";
import { renderPreview } from "./preview.js";
import { renderSvg } from "./render-svg.js";
import { slugify } from "./utils.js";
import { createZip } from "./zip.js";

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
  const archiveFile = `${assetName}.assets.zip`;
  await fs.mkdir(options.out, { recursive: true });

  const generatedFiles = [];
  const { asset: typographyAsset, ...typography } = analysis.typography || {};
  let fontFile;
  if (typographyAsset && options.formats.includes("html")) {
    fontFile = `${assetName}.preview-font${path.extname(typographyAsset).toLowerCase()}`;
    await fs.copyFile(typographyAsset, path.join(options.out, fontFile));
    generatedFiles.push(fontFile);
  }

  const scenes = [];
  const svgByTheme = new Map();
  for (const theme of themes) {
    const scene = { ...planScene(analysis, { ...options, name: assetName }, theme), typography: { ...typography, file: fontFile } };
    const svg = renderSvg(scene);
    const file = `${assetName}.${theme}.svg`;
    svgByTheme.set(theme, svg);
    if (options.formats.includes("svg") || options.formats.includes("html")) {
      await fs.writeFile(path.join(options.out, file), svg);
      generatedFiles.push(file);
    }
    scenes.push({ ...scene, file });
  }

  if (options.formats.includes("html")) {
    const previewFile = `${assetName}.preview.html`;
    const motionLabel = {
      "add-step": "Add step",
      "chart-sweep": "Chart sweep",
      "focus-and-confirm": "Confirm edit",
      "route-propagation": "Route status",
      "select-and-reveal": "Select item",
      "voice-to-task": "Voice task",
    }[scenes[0]?.motion] || concept[0].toUpperCase() + concept.slice(1);
    await fs.writeFile(path.join(options.out, previewFile), renderPreview({
      assets: [{ id: assetName, label: motionLabel, scenes }],
      fontFile,
      name: assetName,
      scenes,
      zipFile: archiveFile,
    }));
    generatedFiles.push(previewFile);
  }

  for (const format of options.formats.filter((item) => ["gif", "webm", "mp4"].includes(item))) {
    for (const scene of scenes) {
      const output = path.join(options.out, `${assetName}.${scene.theme}.${format}`);
      console.log(`Exporting ${path.basename(output)}`);
      await exportMedia(svgByTheme.get(scene.theme), scene, format, output);
      generatedFiles.push(path.basename(output));
    }
  }

  const manifest = {
    analysis: {
      concepts: analysis.concepts,
      features: analysis.features,
      name: analysis.name,
      palettes: analysis.palettes,
      source: analysis.source,
      typography: { ...typography, file: fontFile },
      visual: analysis.visual,
    },
    asset: {
      concept,
      name: assetName,
      oneAssetPerRun: true,
      archive: archiveFile,
      variants: scenes.map(({ backdrop, evidence, file, motion, motionProfile, palette, theme, typography, viewport }) => ({ backdrop, evidence, file, motion, motionProfile, palette, theme, typography, viewport })),
    },
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
  };
  const manifestFile = `${assetName}.manifest.json`;
  await fs.writeFile(path.join(options.out, manifestFile), `${JSON.stringify(manifest, null, 2)}\n`);
  generatedFiles.push(manifestFile);

  const archiveEntries = await Promise.all([...new Set(generatedFiles)].map(async (file) => ({
    data: await fs.readFile(path.join(options.out, file)),
    name: file,
  })));
  await fs.writeFile(path.join(options.out, archiveFile), createZip(archiveEntries));

  console.log(`Generated 1 asset (${concept}) in ${options.out}`);
  for (const scene of scenes) console.log(`  ${scene.theme}: ${scene.file}`);
  if (options.formats.includes("html")) console.log(`  preview: ${assetName}.preview.html`);
  console.log(`  archive: ${archiveFile}`);
}

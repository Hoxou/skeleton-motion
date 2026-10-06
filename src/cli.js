import fs from "node:fs/promises";
import path from "node:path";
import { analyzeSource } from "./analyze.js";
import { HELP, parseArgs } from "./args.js";
import { exportMedia } from "./export-media.js";
import { planScene } from "./plan.js";
import { renderPreview } from "./preview.js";
import { renderSvg } from "./render-svg.js";
import { planAssetSet } from "./set.js";
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
  const stories = planAssetSet(analysis, options);
  const primaryConcept = stories[0].concept;
  const collectionName = slugify(options.name || (options.set ? `${analysis.slug}-motion-set` : `${analysis.slug}-${primaryConcept}`));
  const archiveFile = `${collectionName}.assets.zip`;
  await fs.mkdir(options.out, { recursive: true });

  const generatedFiles = [];
  const { asset: typographyAsset, ...typography } = analysis.typography || {};
  let fontFile;
  if (typographyAsset && options.formats.includes("html")) {
    fontFile = `${collectionName}.preview-font${path.extname(typographyAsset).toLowerCase()}`;
    await fs.copyFile(typographyAsset, path.join(options.out, fontFile));
    generatedFiles.push(fontFile);
  }

  const assets = [];
  const svgByVariant = new Map();
  const paletteOverride = options.set ? analysis.palettes : undefined;
  for (const story of stories) {
    const id = options.set ? `${collectionName}.${story.id}` : collectionName;
    const scenes = [];
    for (const theme of themes) {
      const scene = {
        ...planScene(analysis, { ...options, concept: story.concept, name: id, paletteOverride, story }, theme),
        typography: { ...typography, file: fontFile },
      };
      const svg = renderSvg(scene);
      const file = `${id}.${theme}.svg`;
      svgByVariant.set(`${id}:${theme}`, svg);
      if (options.formats.includes("svg") || options.formats.includes("html")) {
        await fs.writeFile(path.join(options.out, file), svg);
        generatedFiles.push(file);
      }
      scenes.push({ ...scene, file });
    }
    assets.push({ ...story, id, scenes });
  }

  if (options.formats.includes("html")) {
    const previewFile = `${collectionName}.preview.html`;
    await fs.writeFile(path.join(options.out, previewFile), renderPreview({
      assets,
      fontFile,
      name: collectionName,
      scenes: assets[0].scenes,
      zipFile: archiveFile,
    }));
    generatedFiles.push(previewFile);
  }

  for (const format of options.formats.filter((item) => ["gif", "webm", "mp4"].includes(item))) {
    for (const asset of assets) {
      for (const scene of asset.scenes) {
        const output = path.join(options.out, `${asset.id}.${scene.theme}.${format}`);
        console.log(`Exporting ${path.basename(output)}`);
        await exportMedia(svgByVariant.get(`${asset.id}:${scene.theme}`), scene, format, output);
        generatedFiles.push(path.basename(output));
      }
    }
  }

  const summarize = ({ backdrop, colorSemantics, composition, evidence, file, motion, motionPhysics, motionProfile, palette, theme, typography: sceneTypography, viewport }) => ({ backdrop, colorSemantics, composition, evidence, file, motion, motionPhysics, motionProfile, palette, theme, typography: sceneTypography, viewport });
  const manifest = {
    analysis: {
      colorSystem: analysis.colorSystem,
      colorSystems: analysis.colorSystems,
      concepts: analysis.concepts,
      features: analysis.features,
      name: analysis.name,
      palettes: analysis.palettes,
      source: analysis.source,
      themes: analysis.themes,
      typography: { ...typography, file: fontFile },
      visual: analysis.visual,
    },
    generatedAt: new Date().toISOString(),
    schemaVersion: options.set ? 2 : 1,
  };
  if (options.set) {
    manifest.set = {
      archive: archiveFile,
      assets: assets.map((asset) => ({ concept: asset.concept, copy: asset.copy, id: asset.id, label: asset.label, variants: asset.scenes.map(summarize) })),
      name: collectionName,
      preview: options.formats.includes("html") ? `${collectionName}.preview.html` : undefined,
    };
  } else {
    manifest.asset = {
      archive: archiveFile,
      concept: assets[0].concept,
      name: collectionName,
      oneAssetPerRun: true,
      variants: assets[0].scenes.map(summarize),
    };
  }
  const manifestFile = `${collectionName}.manifest.json`;
  await fs.writeFile(path.join(options.out, manifestFile), `${JSON.stringify(manifest, null, 2)}\n`);
  generatedFiles.push(manifestFile);

  const archiveEntries = await Promise.all([...new Set(generatedFiles)].map(async (file) => ({
    data: await fs.readFile(path.join(options.out, file)),
    name: file,
  })));
  await fs.writeFile(path.join(options.out, archiveFile), createZip(archiveEntries));

  console.log(`Generated ${assets.length} asset${assets.length === 1 ? "" : "s"} in ${options.out}`);
  for (const asset of assets) for (const scene of asset.scenes) console.log(`  ${asset.label} / ${scene.theme}: ${scene.file}`);
  if (options.formats.includes("html")) console.log(`  preview: ${collectionName}.preview.html`);
  console.log(`  archive: ${archiveFile}`);
}

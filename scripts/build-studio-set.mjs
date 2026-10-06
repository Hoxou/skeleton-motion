#!/usr/bin/env node
// One-off generator for the "studio" stories used on the marketing site
// (landing page, examples gallery, docs). The palette/layout concepts are
// not inferable from an arbitrary repo, so the stories and copy are authored
// here; the palette, radius, and backdrop come from analyzing this repo, so
// these assets sit in the same family as the CLI-generated site set they
// share the landing page with. See AGENTS.md before changing the hero action.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeSource } from "../src/analyze.js";
import { FORMATS, PRIMARY_ASPECT } from "../src/layout/formats.js";
import { planScene } from "../src/plan.js";
import { renderPreview } from "../src/preview.js";
import { renderSvg } from "../src/render-svg.js";
import { createZip } from "../src/zip.js";
import { SITE_COLORS } from "./site-palette.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "examples", "studio-set");
const COLLECTION_NAME = "skeleton-motion-studio-set";
const THEMES = ["light", "dark"];

const TYPOGRAPHY = {
  family: "Instrument Sans Variable",
  stack: '"Instrument Sans Variable", "Instrument Sans", ui-sans-serif, system-ui, sans-serif',
};

const REPO_ROOT = path.join(__dirname, "..");

const STORIES = [
  {
    id: "assign-color",
    label: "Assign a color",
    concept: "palette",
    // Clicks through the site's own colors and ends back on indigo, so the
    // loop closes on a click instead of a color reset.
    duration: 8.4,
    palette: "site",
    picks: [1, 2, 0],
    copy: {
      eyebrow: "Design system",
      title: "Make the shape match the system.",
      description: "A swatch click updates the shape's color immediately; the rest of the canvas holds still.",
    },
  },
  {
    id: "snap-to-grid",
    label: "Snap to grid",
    concept: "layout",
    copy: {
      eyebrow: "Layout canvas",
      title: "Let it find its place.",
      description: "Guides appear as the shape travels and fade once it settles into the grid.",
    },
  },
];

async function main() {
  const site = await analyzeSource(REPO_ROOT);
  const analysis = {
    concepts: { evidence: [], ranked: [] },
    features: {},
    name: "Skeleton Motion Studio",
    palettes: site.palettes,
    slug: "skeleton-motion-studio",
    source: { input: "skeleton-motion studio set" },
    typography: TYPOGRAPHY,
    visual: site.visual,
  };
  const sitePalettes = Object.fromEntries(THEMES.map((theme) => {
    const { green, indigo, ink, yolk } = SITE_COLORS[theme];
    const swatches = [indigo, yolk, green, ink];
    return [theme, { ...site.palettes[theme], accent: indigo, accents: swatches, colorMode: "multicolor", pastels: swatches }];
  }));
  await fs.mkdir(OUT_DIR, { recursive: true });
  const generatedFiles = [];
  const assets = [];

  for (const story of STORIES) {
    const id = `${COLLECTION_NAME}.${story.id}`;
    const scenes = [];
    for (const theme of THEMES) {
      const paletteOverride = story.palette === "site" ? sitePalettes : undefined;
      const scene = planScene(analysis, { concept: story.concept, duration: story.duration, format: FORMATS[PRIMARY_ASPECT], name: id, paletteOverride, story }, theme);
      const svg = renderSvg(scene);
      const file = `${id}.${theme}.svg`;
      await fs.writeFile(path.join(OUT_DIR, file), svg);
      generatedFiles.push(file);
      scenes.push({ ...scene, file });
    }
    assets.push({ ...story, id, scenes });
  }

  const archiveFile = `${COLLECTION_NAME}.assets.zip`;
  const previewFile = `${COLLECTION_NAME}.preview.html`;
  await fs.writeFile(path.join(OUT_DIR, previewFile), renderPreview({
    assets,
    fontFile: undefined,
    name: COLLECTION_NAME,
    scenes: assets[0].scenes,
    zipFile: archiveFile,
  }));
  generatedFiles.push(previewFile);

  const summarize = ({ backdrop, colorSemantics, composition, duration, evidence, file, motion, motionPhysics, motionProfile, palette, theme, typography, viewport }) =>
    ({ backdrop, colorSemantics, composition, duration, evidence, file, motion, motionPhysics, motionProfile, palette, theme, typography, viewport });
  const manifest = {
    analysis: {
      concepts: analysis.concepts,
      features: analysis.features,
      name: analysis.name,
      palettes: analysis.palettes,
      source: analysis.source,
      themes: THEMES,
      typography: TYPOGRAPHY,
      visual: analysis.visual,
    },
    generatedAt: new Date().toISOString(),
    schemaVersion: 2,
    set: {
      archive: archiveFile,
      assets: assets.map((asset) => ({ concept: asset.concept, copy: asset.copy, id: asset.id, label: asset.label, variants: asset.scenes.map(summarize) })),
      name: COLLECTION_NAME,
      preview: previewFile,
    },
  };
  const manifestFile = `${COLLECTION_NAME}.manifest.json`;
  await fs.writeFile(path.join(OUT_DIR, manifestFile), `${JSON.stringify(manifest, null, 2)}\n`);
  generatedFiles.push(manifestFile);

  const archiveEntries = await Promise.all(generatedFiles.map(async (file) => ({
    data: await fs.readFile(path.join(OUT_DIR, file)),
    name: file,
  })));
  await fs.writeFile(path.join(OUT_DIR, archiveFile), createZip(archiveEntries));

  console.log(`Generated ${assets.length} studio assets in ${OUT_DIR}`);
  for (const asset of assets) for (const scene of asset.scenes) console.log(`  ${asset.label} / ${scene.theme}: ${scene.file}`);
  console.log(`  preview: ${previewFile}`);
  console.log(`  archive: ${archiveFile}`);
}

main();

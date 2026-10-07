import { planDuration } from "./compose/plan.js";
import { PRIMARY_ASPECT, resolveFormats } from "./layout/formats.js";
import { planScene } from "./plan.js";
import { renderPreview } from "./preview.js";
import { renderSvg } from "./render-svg.js";
import { planAssetSet } from "./set.js";
import { slugify } from "./utils.js";

function summarizeScene({ backdrop, colorSemantics, composition, duration, evidence, file, format, motion, motionPhysics, motionProfile, palette, theme, typography, viewport }) {
  return { backdrop, colorSemantics, composition, duration, evidence, file, format: format.id, motion, motionPhysics, motionProfile, palette, theme, typography, viewport };
}

function buildManifest(analysis, options, { archiveFile, assets, collectionName, engineVersion, frameFormats, typography }) {
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
      typography,
      visual: analysis.visual,
    },
    engineVersion,
    formats: frameFormats.map((format) => format.id),
    generatedAt: new Date().toISOString(),
    schemaVersion: options.set ? 2 : 1,
  };
  if (options.set) {
    manifest.set = {
      archive: archiveFile,
      // Designed stories keep their plan so rooms and assets can be re-rendered after engine changes.
      assets: assets.map((asset) => ({ concept: asset.concept, copy: asset.copy, id: asset.id, label: asset.label, ...(asset.plan ? { plan: asset.plan } : {}), variants: asset.scenes.map(summarizeScene) })),
      name: collectionName,
      preview: options.formats.includes("html") ? `${collectionName}.preview.html` : undefined,
    };
  } else {
    manifest.asset = {
      archive: archiveFile,
      concept: assets[0].concept,
      name: collectionName,
      oneAssetPerRun: true,
      variants: assets[0].scenes.map(summarizeScene),
    };
  }
  return manifest;
}

/**
 * Plans and renders a collection without touching the filesystem, so the CLI
 * and the hosted Worker produce identical files.
 *
 * `files` holds the SVGs and Display Room in archive order; the manifest is
 * returned separately because the CLI appends media exports before it.
 * `fontExtension` names the copied source font (the caller copies the bytes);
 * `preview.shell` replaces the on-disk Display Room shell where no filesystem exists.
 * `engineVersion` names the deployed engine release in the manifest.
 * `stories` replaces the built-in story library with validated scene plans
 * ({ id, label, copy, plan }), one designed animation per story.
 */
export function generateCollection(analysis, options, { engineVersion = "dev", fontExtension, preview = {}, stories: designed } = {}) {
  const themes = options.theme === "auto" ? ["light", "dark"] : [options.theme];
  // Designed stories borrow a built-in concept only for palette and timing
  // defaults; their motion always comes from the plan composer.
  const stories = designed?.length ? designed.map((story) => ({ ...story, concept: "editor" })) : planAssetSet(analysis, options);
  const primaryConcept = stories[0].concept;
  const collectionName = slugify(options.name || (options.set ? `${analysis.slug}-motion-set` : `${analysis.slug}-${primaryConcept}`));
  const archiveFile = `${collectionName}.assets.zip`;
  const fontFile = fontExtension && options.formats.includes("html") ? `${collectionName}.preview-font${fontExtension}` : undefined;
  const { asset: _typographyAsset, ...typographyFields } = analysis.typography || {};
  const typography = { ...typographyFields, file: fontFile };
  const writesSvg = options.formats.includes("svg") || options.formats.includes("html");

  const files = [];
  const skipped = [];
  const assets = [];
  const svgByVariant = new Map();
  const paletteOverride = options.set ? analysis.palettes : undefined;
  const frameFormats = resolveFormats(options);
  for (const story of stories) {
    const id = options.set ? `${collectionName}.${story.id}` : collectionName;
    const scenes = [];
    for (const format of frameFormats) {
      // The primary (or only) shape keeps the historical unsuffixed file
      // names so existing embeds keep working.
      const primary = format.custom || format.id === PRIMARY_ASPECT || frameFormats.length === 1;
      for (const theme of themes) {
        const planned = planScene(analysis, { ...options, concept: story.concept, format, name: id, paletteOverride, story }, theme);
        const scene = story.plan
          ? { ...planned, composed: true, duration: options.duration ?? planDuration(story.plan), motion: "plan", typography }
          : { ...planned, typography };
        if (!scene.composed && !primary) {
          if (theme === themes[0]) skipped.push({ format: format.id, label: story.label });
          continue;
        }
        const svg = renderSvg(scene);
        const base = primary ? `${id}.${theme}` : `${id}.${format.slug}.${theme}`;
        const file = `${base}.svg`;
        svgByVariant.set(base, svg);
        if (writesSvg) files.push({ data: svg, name: file });
        scenes.push({ ...scene, file });
      }
    }
    // Preview and story contexts read the first scene per theme, so the
    // primary shape goes first.
    scenes.sort((left, right) => Number(right.format.id === PRIMARY_ASPECT || Boolean(right.format.custom)) - Number(left.format.id === PRIMARY_ASPECT || Boolean(left.format.custom)));
    assets.push({ ...story, id, scenes });
  }

  if (options.formats.includes("html")) {
    files.push({
      data: renderPreview({ assets, fontFile, name: collectionName, scenes: assets[0].scenes, zipFile: archiveFile }, preview.shell),
      name: `${collectionName}.preview.html`,
    });
  }

  const manifest = buildManifest(analysis, options, { archiveFile, assets, collectionName, engineVersion, frameFormats, typography });
  return {
    archiveFile,
    assets,
    collectionName,
    files,
    fontFile,
    manifest: { data: `${JSON.stringify(manifest, null, 2)}\n`, name: `${collectionName}.manifest.json`, value: manifest },
    skipped,
    svgByVariant,
  };
}

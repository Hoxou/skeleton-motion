// Builds the JSON the Display Room app (tools/preview-shell) renders from.
// Browser-safe on purpose: the room's dev server imports it too.

const FALLBACK_COPY = { description: "A focused product motion composed for a landing-page feature.", eyebrow: "Product motion", title: "Show the useful moment." };
const LIGHT_FALLBACK = { accent: "#4f46e5", border: "#e5e7eb", copy: "#71717a", ink: "#171717", page: "#fff", panel: "#fff", panelSolid: "#f4f4f5" };
const DARK_FALLBACK = { accent: "#818cf8", border: "rgb(255 255 255 / 10%)", copy: "#a1a1aa", ink: "#fafafa", page: "#111113", panel: "#202024", panelSolid: "#27272a" };

// Values land in CSS custom properties; reject anything that could end the
// declaration or the rule.
function safeCss(value, fallback) {
  const text = String(value || "").trim();
  return text && !/[;{}<>]/.test(text) ? text : fallback;
}

function labelFromId(value) {
  return String(value).replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sourceTokens(palette = {}, fallback) {
  const accents = palette.accents || [palette.accent];
  const accent = safeCss(palette.accent, fallback.accent);
  return {
    accent,
    accent2: safeCss(accents[1], accent),
    accent3: safeCss(accents[2], accents[1] || accent),
    border: safeCss(palette.border, fallback.border),
    copy: safeCss(palette.mutedForeground, fallback.copy),
    ink: safeCss(palette.foreground, fallback.ink),
    page: safeCss(palette.background, fallback.page),
    panel: safeCss(palette.surface, fallback.panel),
    panelSolid: safeCss(palette.muted, fallback.panelSolid),
  };
}

/**
 * @param assets list of { id, label, copy?, scenes }; omit for a single-asset run and pass `scenes`.
 * @param fontFile source font copied next to the room, referenced relatively.
 */
export function roomData({ assets, fontFile, name, scenes, zipFile }) {
  const groups = assets?.length ? assets : [{ id: name, label: labelFromId(name), scenes }];
  const primary = groups[0].scenes;
  const light = primary.find((scene) => scene.theme === "light") || primary[0];
  const dark = primary.find((scene) => scene.theme === "dark");
  const lightPalette = light.palette || {};

  return {
    archive: zipFile || `${name}.assets.zip`,
    assets: groups.map((group) => ({
      copy: { ...FALLBACK_COPY, ...(group.copy || {}) },
      id: group.id,
      label: group.label,
      variants: group.scenes.map((scene) => ({
        file: scene.file,
        format: scene.format?.id ?? null,
        height: scene.viewport.height,
        theme: scene.theme || "light",
        width: scene.viewport.width,
      })),
    })),
    name,
    source: {
      dark: dark && dark !== light ? sourceTokens(dark.palette || lightPalette, DARK_FALLBACK) : null,
      fontFile: fontFile && /^[\w.-]+$/.test(fontFile) ? fontFile : null,
      fontStack: safeCss(light.typography?.stack, "ui-sans-serif, system-ui, sans-serif"),
      light: sourceTokens(lightPalette, LIGHT_FALLBACK),
      radius: Math.max(0, Math.min(32, Number.parseFloat(lightPalette.radius) || 0)),
    },
  };
}

/** Rebuilds renderPreview/roomData input from a written *.manifest.json. */
export function previewInputFromManifest(manifest, manifestFile) {
  const toScene = (variant) => ({ ...variant, format: variant.format ? { id: variant.format } : undefined });
  const { set } = manifest;
  const name = set?.name || manifest.asset?.name || manifestFile.replace(/\.manifest\.json$/, "");
  const assets = set
    ? set.assets.map((asset) => ({ ...asset, scenes: asset.variants.map(toScene) }))
    : [{ id: name, label: labelFromId(name), scenes: manifest.asset.variants.map(toScene) }];
  return {
    assets: set ? assets : undefined,
    fontFile: assets[0].scenes[0]?.typography?.file,
    name,
    previewFile: set?.preview || `${name}.preview.html`,
    scenes: assets[0].scenes,
    zipFile: set?.archive || manifest.asset?.archive,
  };
}

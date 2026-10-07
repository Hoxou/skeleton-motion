import fs from "node:fs/promises";
import path from "node:path";
import { colorFamilies, hueGap, mixColors, toHex } from "./color.js";
import { collectFilesByExtensions, collectTextFiles, isUrl, readText, slugify } from "./utils.js";

const SIGNALS = {
  flow: ["automation", "canvas", "edge", "flow", "node", "pipeline", "scenario", "step", "workflow", "xyflow"],
  list: ["case", "filter", "folder", "library", "list", "row", "search", "table", "tag", "tree"],
  dashboard: ["analytics", "chart", "dashboard", "insight", "metric", "report", "stat", "usage"],
  editor: ["contenteditable", "editor", "field", "form", "input", "preview", "textarea"],
};

const FILE_BONUSES = ["page", "view", "canvas", "editor", "dashboard", "library"];
const FILE_PENALTIES = ["test", "spec", "fixture", "loading", "skeleton", "provider"];
const CHROMATIC_FAMILIES = new Set([
  "amber", "blue", "cyan", "emerald", "fuchsia", "green", "indigo", "lime", "orange", "pink", "purple", "red", "rose", "sky", "teal", "violet", "yellow",
]);

function findBlock(css, selector, fromIndex = 0) {
  const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(^|[}\\s,])${escaped}\\s*\\{`, "m").exec(cleanCss.slice(fromIndex));
  if (!match) return "";
  const brace = fromIndex + match.index + match[0].lastIndexOf("{");
  if (brace < 0) return "";
  let depth = 1;
  for (let index = brace + 1; index < cleanCss.length; index += 1) {
    if (cleanCss[index] === "{") depth += 1;
    if (cleanCss[index] === "}") depth -= 1;
    if (depth === 0) return cleanCss.slice(brace + 1, index);
  }
  return "";
}

function parseVariables(block) {
  const variables = {};
  for (const match of block.matchAll(/--([a-zA-Z0-9_-]+)\s*:\s*([^;}{]+)\s*;/g)) {
    variables[match[1]] = match[2].trim();
  }
  return variables;
}

function parseFirstVariables(block) {
  const variables = {};
  for (const match of block.matchAll(/--([a-zA-Z0-9_-]+)\s*:\s*([^;}{]+)\s*;/g)) {
    if (!(match[1] in variables)) variables[match[1]] = match[2].trim();
  }
  return variables;
}

function resolveVariable(value, variables, seen = new Set()) {
  if (!value) return undefined;
  const match = value.match(/^var\(--([a-zA-Z0-9_-]+)(?:,\s*([^)]+))?\)$/);
  if (!match) return value;
  if (seen.has(match[1])) return match[2]?.trim();
  seen.add(match[1]);
  return resolveVariable(variables[match[1]] || match[2]?.trim(), variables, seen);
}

function token(variables, names, fallback) {
  for (const name of names) {
    const value = resolveVariable(variables[name], variables);
    if (value) return value;
  }
  return fallback;
}

function readTheme(cssText, selector, inherited = {}) {
  const block = findBlock(cssText, selector);
  return { ...inherited, ...parseVariables(block) };
}

// Status and chart variables sometimes hold filters or gradients rather
// than colors; only plain color syntax may become a palette role.
const CSS_COLOR = /^(?:#[0-9a-f]{3,8}|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([\d\s.,%/+a-z-]*\)|[a-z]{3,20})$/i;
const COLOR_KEYWORD_BLOCKLIST = /^(?:initial|inherit|unset|revert|none|transparent|currentcolor|auto|normal)$/i;

function uniqueColors(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = String(value || "").trim().toLowerCase();
    if (!key || seen.has(key) || !CSS_COLOR.test(key) || COLOR_KEYWORD_BLOCKLIST.test(key)) return false;
    seen.add(key);
    return true;
  });
}

// The main color carrying this much of the page means the brand reads as one color.
const MONOCHROME_SHARE = 0.9;
const MAX_ACCENTS = 4;

// Every color a page uses, weighted by how much of the page it likely
// covers: fills and backgrounds count most, text and borders least, and a
// gradient's stops share its weight. The palette is read from these weights
// as hue families with a share each, so the main color is the one the page
// is mostly made of and the rest appear about as often as they do there.
const PROPERTY_WEIGHTS = [
  [/^background(?:-color|-image)?$/, 3],
  [/^(?:fill|stroke|stop-color)$/, 2],
  [/^(?:color|border(?:-[a-z]+)*|outline(?:-color)?|caret-color|accent-color|text-decoration-color)$/, 1],
];
const COLOR_IN_VALUE = /#[0-9a-f]{8}\b|#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\([^)]*\)/gi;

function declaredColorWeights(css) {
  const weights = [];
  for (const match of String(css || "").matchAll(/(?:^|[;{\s])(-{0,2}[a-z][\w-]*)\s*:\s*([^;{}]+)/gi)) {
    const property = match[1].toLowerCase();
    const weight = property.startsWith("--") ? 0.5 : PROPERTY_WEIGHTS.find(([pattern]) => pattern.test(property))?.[1] ?? 0.5;
    const colors = match[2].match(COLOR_IN_VALUE) || [];
    const each = /gradient\(/i.test(match[2]) ? weight / Math.max(1, colors.length) : weight;
    for (const color of colors) weights.push([color, each]);
  }
  return weights;
}

// Markup that carries the brand's own colors: inline styles, and the logo
// (the link home, or the first graphic in the header). Other inline SVG on
// a landing page, menus included, is mostly customer and integration logos.
function markupColorWeights(html) {
  const source = String(html || "");
  const home = [...source.matchAll(/<a\b[^>]*href=["'](?:\/|https?:\/\/[^/"']+\/?)["'][^>]*>[\s\S]*?<\/a>/gi)].map((match) => match[0]).slice(0, 2);
  const header = source.match(/<header\b[\s\S]*?<\/header>/i)?.[0] || "";
  const logo = [...home, header.match(/<svg\b[\s\S]*?<\/svg>/i)?.[0] || ""].join("\n");
  const styles = [...source.matchAll(/\sstyle=["']([^"']*)["']/gi)].map((match) => `;${match[1]}`).join("\n");
  // The logo is the one mark guaranteed to be the brand; it counts like a fill.
  return [...(logo.match(COLOR_IN_VALUE) || []).map((color) => [color, 3]), ...declaredColorWeights(styles)];
}

function inferColorSystem(sourceText, cssText = "") {
  const familyCounts = new Map();
  const classPattern = /(?:^|[^\w-])(?:bg|text|border|from|via|to|ring|shadow)-([a-z]+)-(\d{2,3})(?:\/\d+)?/gi;
  for (const match of sourceText.matchAll(classPattern)) {
    const family = match[1].toLowerCase();
    if (CHROMATIC_FAMILIES.has(family)) familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
  }

  const variables = parseFirstVariables(cssText);
  const families = [...familyCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([family]) => family);
  const resolveFamily = (family, shades) => shades
    .map((shade) => resolveVariable(variables[`color-${family}-${shade}`], variables))
    .find(Boolean);
  // Utility-class sites name their palette directly; dark themes take the lighter shade.
  const darkShades = {};
  const utilityWeights = families.flatMap((family) => {
    const light = toHex(resolveFamily(family, [600, 500, 700, 400]));
    const dark = toHex(resolveFamily(family, [400, 500, 300, 600]));
    if (light && dark) darkShades[light] = dark;
    return light ? [[light, familyCounts.get(family) * 3]] : [];
  });
  const semanticWeights = Object.entries(variables)
    .filter(([name]) => /(?:^|[-_])(chart|tag|status|success|warning|info)(?:[-_]|$)/i.test(name) && sourceText.includes(`--${name}`))
    .map(([, value]) => [resolveVariable(value, variables), 2]);

  // A rendered page's measured coverage (see worker/brand-probe.js) is the
  // truth when present; older probes only listed colors.
  const measuredShares = Object.entries(variables)
    .filter(([name]) => /^measured-share-\d+$/.test(name))
    .map(([, value]) => value.trim().split(/\s+/))
    .map(([color, weight]) => [color, Number(weight)])
    .filter(([, weight]) => Number.isFinite(weight));
  const measuredColors = Object.entries(variables)
    .filter(([name]) => /^measured-accent-\d$/.test(name))
    .map(([, value]) => [value, 3]);
  const weighted = measuredShares.length
    ? measuredShares
    : [...utilityWeights, ...semanticWeights, ...measuredColors, ...declaredColorWeights(cssText), ...markupColorWeights(sourceText)];

  const warmFamily = families.find((family) => ["amber", "orange", "yellow"].includes(family));
  const lightCanvas = warmFamily ? resolveFamily(warmFamily, [50, 100]) : undefined;
  const colorShares = colorFamilies(weighted);
  const mode = colorShares.length >= 2 && colorShares[0].share < MONOCHROME_SHARE ? "multicolor" : "monochrome";
  return { colorShares, darkShades, families, lightCanvas, measured: measuredShares.length > 0, mode };
}

// Used when the source exposes no brand token; callers compare against it
// to tell "measured" from "guessed".
export const DEFAULT_ACCENT = "#4f46e5";

// A measured call-to-action color leads only when the rendered page
// actually uses it this much, and no other color covers far more of it;
// otherwise the most used color does.
const MEASURED_MIN_SHARE = 0.15;
const DOMINANT_RATIO = 2.5;

/**
 * Accents in order of how much of the page they cover, main color first,
 * with each one's share. `primary` leads unless `guessed`; the other hues
 * follow by share.
 */
function rankAccents(primary, colorShares, guessed) {
  const primaryHex = toHex(primary);
  const own = primaryHex ? colorShares.find((family) => hueGap(family.hex, primaryHex) < 25) : null;
  const main = !guessed && primaryHex ? { hex: primary, share: own?.share ?? 0 } : colorShares[0] || { hex: primary, share: 1 };
  const picked = [main];
  for (const family of colorShares) {
    if (picked.length >= MAX_ACCENTS) break;
    if (family === own || (guessed && family === colorShares[0])) continue;
    if (picked.every((other) => !toHex(other.hex) || hueGap(family.hex, toHex(other.hex)) >= 40)) picked.push(family);
  }
  const total = picked.reduce((sum, family) => sum + family.share, 0);
  return picked.map((family) => ({ hex: family.hex, share: total ? Number((family.share / total).toFixed(4)) : 1 / picked.length }));
}

function buildPalette(lightVariables, darkVariables, colorSystem = {}) {
  const light = {
    accent: token(lightVariables, ["primary", "brand", "brand-primary"], DEFAULT_ACCENT),
    background: token(lightVariables, ["background", "page", "canvas"], "#ffffff"),
    border: token(lightVariables, ["border", "input"], "#e5e7eb"),
    foreground: token(lightVariables, ["foreground", "text", "card-foreground"], "#171717"),
    muted: token(lightVariables, ["muted", "secondary"], "#f4f4f5"),
    mutedForeground: token(lightVariables, ["muted-foreground", "secondary-foreground"], "#71717a"),
    radius: token(lightVariables, ["radius", "radius-lg"], "12px"),
    surface: token(lightVariables, ["card", "popover", "surface"], "#ffffff"),
  };
  // Where the accent comes from: a brand token in the CSS (trusted), the
  // rendered page's call-to-action color (trusted unless measured coverage
  // says the page hardly uses it), or the page's most used color.
  const shares = colorSystem.colorShares || [];
  const measuredPrimary = toHex(lightVariables["measured-primary"]);
  const measuredShare = measuredPrimary ? shares.find((family) => hueGap(family.hex, measuredPrimary) < 25)?.share ?? 0 : 0;
  const outweighed = (shares[0]?.share ?? 0) > measuredShare * DOMINANT_RATIO;
  if (light.accent === DEFAULT_ACCENT && measuredPrimary && (!colorSystem.measured || (measuredShare >= MEASURED_MIN_SHARE && !outweighed))) light.accent = measuredPrimary;
  const tokenLike = light.accent !== DEFAULT_ACCENT;
  const ranked = rankAccents(light.accent, shares, !tokenLike);
  // Where the accent came from: a named token, the page's most used color, or
  // the built-in default. Only a token is certain; the hosted Worker
  // measures the rendered page for the other two.
  light.accentSource = light.accent === measuredPrimary ? "measured" : tokenLike ? "token" : shares.length ? "page" : "default";
  if (light.accentSource === "page") light.accent = ranked[0].hex;
  const hasSourceDark = Object.keys(darkVariables).length > 0;
  const combinedDark = hasSourceDark ? { ...lightVariables, ...darkVariables } : {};
  const dark = {
    accent: token(combinedDark, ["primary", "brand", "brand-primary"], mixColors(light.accent, 78, "#ffffff")),
    background: token(combinedDark, ["background", "page", "canvas"], "#111113"),
    border: token(combinedDark, ["border", "input"], "rgb(255 255 255 / 10%)"),
    foreground: token(combinedDark, ["foreground", "text", "card-foreground"], "#fafafa"),
    muted: token(combinedDark, ["muted", "secondary"], "#27272a"),
    mutedForeground: token(combinedDark, ["muted-foreground", "secondary-foreground"], "#a1a1aa"),
    radius: token(combinedDark, ["radius", "radius-lg"], light.radius),
    surface: token(combinedDark, ["card", "popover", "surface"], "#202024"),
  };
  const shades = colorSystem.darkShades || {};
  light.accents = uniqueColors([light.accent, ...ranked.slice(1).map((family) => family.hex)]);
  light.shares = light.accents.map((hex, index) => ranked[index]?.share ?? 0);
  dark.accents = uniqueColors([dark.accent, ...light.accents.slice(1).map((hex) => shades[hex] || hex)]);
  dark.shares = light.shares.slice(0, dark.accents.length);
  light.pastels = light.accents.map((accent) => mixColors(accent, 14, light.surface));
  dark.pastels = dark.accents.map((accent) => mixColors(accent, 22, dark.surface));
  light.colorMode = light.accents.length >= 2 && light.shares[0] < MONOCHROME_SHARE ? "multicolor" : "monochrome";
  dark.colorMode = light.colorMode;
  light.canvas = colorSystem.lightCanvas;
  dark.canvas = light.colorMode === "multicolor" && light.canvas ? mixColors(dark.background, 92, dark.accents.at(-1) || dark.accent) : undefined;
  return { dark, light };
}

function themeSupport(darkVariables) {
  return { dark: Object.keys(darkVariables).length > 0 ? "source" : "derived", light: "source" };
}

function readableFontName(identifier) {
  return identifier
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function inferTypography(cssText, sourceText) {
  const explicit = [...cssText.matchAll(/font-family\s*:\s*([^;}{]+)/gi)]
    .map((match) => match[1].trim())
    .find((value) => !/inherit|var\(/i.test(value));
  if (explicit) return { family: explicit.split(",")[0].replace(/["']/g, "").trim(), stack: explicit };

  const imported = [...sourceText.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']next\/font\/(?:google|local)["']/g)]
    .flatMap((match) => match[1].split(",").map((name) => name.trim().split(/\s+as\s+/i)[0]))
    .filter(Boolean);
  const identifier = imported.find((name) => !/mono/i.test(name)) || imported[0];
  const family = identifier ? readableFontName(identifier) : "system-ui";
  return { family, stack: identifier ? `"${family}", ui-sans-serif, system-ui, sans-serif` : "ui-sans-serif, system-ui, sans-serif" };
}

function inferBackdrop(sourceText) {
  const hasDotCanvas = /BackgroundVariant\.Dots|react-flow__background-pattern[^\n]{0,120}\bdots?\b|(?:dot-grid|grid-dots|background-dots|bg-dots)\b/i.test(sourceText);
  return hasDotCanvas ? "dots" : "none";
}

function inferFeatures(sourceText) {
  const voice = /voice[- ](?:first|assisted|command|commands|control|input)|speech[- ]to[- ]text/i.test(sourceText);
  return { voice };
}

async function findFontAsset(root, family) {
  const fonts = await collectFilesByExtensions(root, new Set([".woff", ".woff2", ".ttf", ".otf"]), 200);
  if (fonts.length === 0) return undefined;
  const wanted = family.toLowerCase().replace(/[^a-z0-9]/g, "");
  return fonts.find((file) => path.basename(file).toLowerCase().replace(/[^a-z0-9]/g, "").includes(wanted)) || fonts[0];
}

function scoreFile(relative, content) {
  const haystack = `${relative}\n${content.slice(0, 180_000)}`.toLowerCase();
  const scores = Object.fromEntries(Object.keys(SIGNALS).map((kind) => [kind, 0]));
  for (const [kind, words] of Object.entries(SIGNALS)) {
    for (const word of words) {
      const count = Math.min(6, haystack.split(word).length - 1);
      scores[kind] += count * 2;
    }
  }
  for (const word of FILE_BONUSES) if (relative.toLowerCase().includes(word)) {
    for (const kind of Object.keys(scores)) scores[kind] += 2;
  }
  for (const word of FILE_PENALTIES) if (relative.toLowerCase().includes(word)) {
    for (const kind of Object.keys(scores)) scores[kind] -= 8;
  }
  if (/on(click|select|submit)|draggable|useinview|animate/i.test(content)) {
    for (const kind of Object.keys(scores)) scores[kind] += 5;
  }
  if (/@xyflow\/react|reactflow/i.test(content)) scores.flow += 35;
  if (/<table|tanstack\/react-table/i.test(content)) scores.list += 22;
  if (/recharts|chart\.js|echarts/i.test(content)) scores.dashboard += 25;
  return scores;
}

function rankConcepts(files) {
  const totals = { dashboard: 0, editor: 0, flow: 0, list: 0 };
  const evidence = [];
  for (const file of files) {
    for (const [kind, score] of Object.entries(file.scores)) totals[kind] += Math.max(0, score);
    const [bestKind, bestScore] = Object.entries(file.scores).sort((a, b) => b[1] - a[1])[0];
    if (bestScore > 0) evidence.push({ file: file.relative, kind: bestKind, score: bestScore });
  }
  const ranked = Object.entries(totals)
    .map(([kind, score]) => ({ kind, score }))
    .sort((a, b) => b.score - a.score || a.kind.localeCompare(b.kind));
  evidence.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  return { evidence: evidence.slice(0, 8), ranked };
}

async function analyzeRepository(source) {
  const root = path.resolve(source);
  const stat = await fs.stat(root).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`repository directory not found: ${root}`);
  const paths = await collectTextFiles(root);
  const files = [];
  let cssText = "";
  let sourceText = "";
  let backdrop = "none";
  let voice = false;
  for (const absolute of paths) {
    const content = await readText(absolute);
    const relative = path.relative(root, absolute);
    if (/\.(css|scss|sass)$/i.test(relative)) cssText += `\n${content}`;
    if (sourceText.length < 2_000_000) sourceText += `\n${content.slice(0, 2_000_000 - sourceText.length)}`;
    if (backdrop === "none") backdrop = inferBackdrop(content);
    if (!voice) voice = inferFeatures(content).voice;
    const colorEvidence = (content.match(/(?:bg|text|border|from|via|to|ring|shadow)-[a-z]+-\d{2,3}(?:\/\d+)?|var\(--[a-zA-Z0-9_-]+\)/g) || []).join(" ");
    files.push({ colorEvidence, relative, scores: scoreFile(relative, content) });
  }
  const lightVariables = readTheme(cssText, ":root");
  const darkVariables = readTheme(cssText, ".dark");
  const concepts = rankConcepts(files);
  const colorSystems = Object.fromEntries(Object.keys(SIGNALS).map((kind) => {
    const evidence = files
      .filter((file) => file.scores[kind] > 0 && !/(?:^|\/)(?:docs?|research|prototype|tests?|fixtures?)(?:\/|$)/i.test(file.relative))
      .sort((a, b) => b.scores[kind] - a.scores[kind])
      .slice(0, 8)
      .map((file) => file.colorEvidence)
      .join(" ");
    return [kind, inferColorSystem(evidence, cssText)];
  }));
  const colorSystem = colorSystems[concepts.ranked[0]?.kind] || inferColorSystem("", cssText);
  const palettesByConcept = Object.fromEntries(Object.entries(colorSystems).map(([kind, system]) => [kind, buildPalette(lightVariables, darkVariables, system)]));
  const typography = inferTypography(cssText, sourceText);
  typography.asset = await findFontAsset(root, typography.family);
  return {
    concepts,
    name: path.basename(root),
    colorSystem,
    colorSystems,
    palettes: buildPalette(lightVariables, darkVariables, colorSystem),
    palettesByConcept,
    themes: themeSupport(darkVariables),
    source: { input: root, scannedFiles: paths.length, type: "repository" },
    features: { voice },
    typography,
    visual: { backdrop },
  };
}

// Stylesheets the page links, its own origin first. Brands often serve CSS
// from a CDN host, so other https origins count too (the hosted Worker's
// fetch still vets every URL).
function extractLinkedStyles(html, url) {
  const origin = new URL(url).origin;
  const own = [];
  const other = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel=["']?stylesheet\b/i.test(tag)) continue;
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      const linked = new URL(href, url);
      if (linked.origin === origin) own.push(linked.href);
      else if (linked.protocol === "https:") other.push(linked.href);
    } catch {
      // Ignore malformed stylesheet links.
    }
  }
  return [...new Set([...own, ...other])].slice(0, 12);
}

async function analyzeUrl(source, fetch, measuredCss = "") {
  const response = await fetch(source, { headers: { "user-agent": "skeleton-motion/0.1" }, redirect: "follow" });
  if (!response.ok) throw new Error(`URL returned ${response.status}: ${source}`);
  const html = await response.text();
  let cssText = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join("\n");
  const sheets = extractLinkedStyles(html, response.url || source);
  const fetched = await Promise.allSettled(sheets.map(async (url) => {
    const sheet = await fetch(url, { headers: { "user-agent": "skeleton-motion/0.1" } });
    return sheet.ok ? sheet.text() : "";
  }));
  for (const result of fetched) if (result.status === "fulfilled") cssText += `\n${await result.value}`;
  // Measured values come first: theme and typography readers take the first match.
  cssText = `${measuredCss}\n${cssText}`;
  const lightVariables = readTheme(cssText, ":root");
  const darkVariables = readTheme(cssText, ".dark");
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || new URL(response.url).hostname;
  const scores = scoreFile(response.url, html);
  const files = [{ relative: response.url, scores }];
  const typography = inferTypography(cssText, html);
  const features = inferFeatures(html);
  const colorSystem = inferColorSystem(html, cssText);
  const palettes = buildPalette(lightVariables, darkVariables, colorSystem);
  return {
    colorSystem,
    concepts: rankConcepts(files),
    features,
    name: title,
    palettes,
    palettesByConcept: Object.fromEntries(Object.keys(SIGNALS).map((kind) => [kind, palettes])),
    themes: themeSupport(darkVariables),
    source: { input: response.url, linkedStylesheets: sheets.length, type: "url" },
    typography,
    visual: { backdrop: inferBackdrop(html) },
  };
}

// The hosted Worker passes a guarded `fetch` that validates every URL the
// analyzer requests, including redirects and linked stylesheets, and
// `measuredCss` built from the page's computed styles when it has them.
export async function analyzeSource(source, { fetch = globalThis.fetch, measuredCss } = {}) {
  const analysis = isUrl(source) ? await analyzeUrl(source, fetch, measuredCss) : await analyzeRepository(source);
  return { ...analysis, slug: slugify(analysis.name) };
}

export const __testing = { buildPalette, findBlock, inferBackdrop, inferColorSystem, inferFeatures, inferTypography, parseVariables, rankConcepts, scoreFile, themeSupport };

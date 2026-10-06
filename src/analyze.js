import fs from "node:fs/promises";
import path from "node:path";
import { collectTextFiles, isUrl, readText, slugify } from "./utils.js";

const SIGNALS = {
  flow: ["automation", "canvas", "edge", "flow", "node", "pipeline", "scenario", "step", "workflow", "xyflow"],
  list: ["case", "filter", "folder", "library", "list", "row", "search", "table", "tag", "tree"],
  dashboard: ["analytics", "chart", "dashboard", "insight", "metric", "report", "stat", "usage"],
  editor: ["contenteditable", "editor", "field", "form", "input", "preview", "textarea"],
};

const FILE_BONUSES = ["page", "view", "canvas", "editor", "dashboard", "library"];
const FILE_PENALTIES = ["test", "spec", "fixture", "loading", "skeleton", "provider"];

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

function buildPalette(lightVariables, darkVariables) {
  const light = {
    accent: token(lightVariables, ["primary", "brand", "brand-primary"], "#4f46e5"),
    background: token(lightVariables, ["background", "page", "canvas"], "#ffffff"),
    border: token(lightVariables, ["border", "input"], "#e5e7eb"),
    foreground: token(lightVariables, ["foreground", "text", "card-foreground"], "#171717"),
    muted: token(lightVariables, ["muted", "secondary"], "#f4f4f5"),
    radius: token(lightVariables, ["radius", "radius-lg"], "12px"),
    surface: token(lightVariables, ["card", "popover", "surface"], "#ffffff"),
  };
  const combinedDark = { ...lightVariables, ...darkVariables };
  const dark = {
    accent: token(combinedDark, ["primary", "brand", "brand-primary"], "#818cf8"),
    background: token(combinedDark, ["background", "page", "canvas"], "#111113"),
    border: token(combinedDark, ["border", "input"], "rgb(255 255 255 / 10%)"),
    foreground: token(combinedDark, ["foreground", "text", "card-foreground"], "#fafafa"),
    muted: token(combinedDark, ["muted", "secondary"], "#27272a"),
    radius: token(combinedDark, ["radius", "radius-lg"], light.radius),
    surface: token(combinedDark, ["card", "popover", "surface"], "#202024"),
  };
  return { dark, light };
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
  for (const absolute of paths) {
    const content = await readText(absolute);
    const relative = path.relative(root, absolute);
    if (/\.(css|scss|sass)$/i.test(relative)) cssText += `\n${content}`;
    files.push({ relative, scores: scoreFile(relative, content) });
  }
  const lightVariables = readTheme(cssText, ":root");
  const darkVariables = readTheme(cssText, ".dark");
  const concepts = rankConcepts(files);
  return {
    concepts,
    name: path.basename(root),
    palettes: buildPalette(lightVariables, darkVariables),
    source: { input: root, scannedFiles: paths.length, type: "repository" },
  };
}

function extractLinkedStyles(html, url) {
  const styles = [];
  for (const match of html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)) {
    try {
      const linked = new URL(match[1], url);
      if (linked.origin === new URL(url).origin) styles.push(linked.href);
    } catch {
      // Ignore malformed stylesheet links.
    }
  }
  return styles.slice(0, 12);
}

async function analyzeUrl(source) {
  const response = await fetch(source, { headers: { "user-agent": "skeleton-motion/0.1" }, redirect: "follow" });
  if (!response.ok) throw new Error(`URL returned ${response.status}: ${source}`);
  const html = await response.text();
  let cssText = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join("\n");
  const sheets = extractLinkedStyles(html, response.url);
  const fetched = await Promise.allSettled(sheets.map(async (url) => {
    const sheet = await fetch(url, { headers: { "user-agent": "skeleton-motion/0.1" } });
    return sheet.ok ? sheet.text() : "";
  }));
  for (const result of fetched) if (result.status === "fulfilled") cssText += `\n${await result.value}`;
  const lightVariables = readTheme(cssText, ":root");
  const darkVariables = readTheme(cssText, ".dark");
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || new URL(response.url).hostname;
  const scores = scoreFile(response.url, html);
  const files = [{ relative: response.url, scores }];
  return {
    concepts: rankConcepts(files),
    name: title,
    palettes: buildPalette(lightVariables, darkVariables),
    source: { input: response.url, linkedStylesheets: sheets.length, type: "url" },
  };
}

export async function analyzeSource(source) {
  const analysis = isUrl(source) ? await analyzeUrl(source) : await analyzeRepository(source);
  return { ...analysis, slug: slugify(analysis.name) };
}

export const __testing = { buildPalette, findBlock, parseVariables, rankConcepts, scoreFile };

#!/usr/bin/env node
// Rendered-truth fill audit: plays each composed SVG in Chrome, samples the
// loop, and reports how far visible region content sits from its region edges.
// Usage: node scripts/audit-fill.mjs <file.svg|dir> [...] [--samples 60] [--tolerance 1]
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

function parseOptions(argv) {
  const options = { inputs: [], samples: 60, tolerance: 1 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--samples") options.samples = Number(argv[++index]);
    else if (argv[index] === "--tolerance") options.tolerance = Number(argv[++index]);
    else options.inputs.push(argv[index]);
  }
  if (options.inputs.length === 0) throw new Error("pass at least one SVG file or directory");
  return options;
}

async function collect(inputs) {
  const files = [];
  for (const input of inputs) {
    const stat = await fs.stat(input);
    if (stat.isDirectory()) {
      for (const entry of await fs.readdir(input)) if (entry.endsWith(".svg")) files.push(path.join(input, entry));
    } else files.push(input);
  }
  return files.sort();
}

async function findChrome() {
  for (const candidate of CHROME_PATHS) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("Chrome or Chromium not found. Set CHROME_PATH");
}

function measure(samples) {
  const root = document.querySelector("svg");
  const layout = JSON.parse(root.querySelector("#skeleton-layout")?.textContent || "null");
  if (!layout) return undefined;
  root.pauseAnimations();
  const duration = Math.max(...[...root.querySelectorAll("animate, animateTransform")].map((node) => Number.parseFloat(node.getAttribute("dur")) || 0));
  const matrix = root.getScreenCTM().inverse();
  const toUser = (x, y) => new DOMPoint(x, y).matrixTransform(matrix);
  // A group part-way through a fade is entering or leaving as a whole, so its
  // shapes are not settled content yet; a shape's own opacity may be a style.
  const visible = (node) => {
    for (let current = node; current && current !== root; current = current.parentElement) {
      const style = getComputedStyle(current);
      const threshold = current === node ? 0.05 : 0.99;
      if (style.display === "none" || Number.parseFloat(style.opacity) < threshold) return false;
    }
    return true;
  };
  const worst = {};
  for (let index = 0; index < samples; index += 1) {
    root.setCurrentTime(duration * index / samples);
    for (const [name, region] of Object.entries(layout.regions)) {
      const nodes = [...root.querySelectorAll(`[data-fill="${name}"]`)].filter(visible);
      if (nodes.length === 0) continue;
      const boxes = nodes.map((node) => node.getBoundingClientRect()).filter((box) => box.width > 0.5 && box.height > 0.5);
      const start = toUser(Math.min(...boxes.map((box) => box.left)), Math.min(...boxes.map((box) => box.top)));
      const end = toUser(Math.max(...boxes.map((box) => box.right)), Math.max(...boxes.map((box) => box.bottom)));
      // Bounding boxes include half the stroke; compare against stroke-free geometry.
      const gaps = {
        bottom: region.y + region.height - end.y,
        left: start.x - region.x,
        right: region.x + region.width - end.x,
        top: start.y - region.y,
      };
      const largest = Math.max(...Object.values(gaps));
      if (!worst[name] || largest > worst[name].gap) worst[name] = { at: Number((index / samples).toFixed(3)), gap: largest, gaps };
    }
  }
  return { format: layout.format, worst };
}

const options = parseOptions(process.argv.slice(2));
const files = await collect(options.inputs);
const browser = await chromium.launch({ executablePath: await findChrome(), headless: true });
let failures = 0;
try {
  const page = await browser.newPage();
  for (const file of files) {
    const markup = (await fs.readFile(file, "utf8")).replace(/^<\?xml[^>]+>\s*/, "");
    await page.setContent(`<style>html,body{margin:0}svg{display:block}</style>${markup}`);
    const result = await page.evaluate(measure, options.samples);
    if (!result) {
      console.log(`skip  ${path.basename(file)} (not a composed asset)`);
      continue;
    }
    for (const [region, { at, gap }] of Object.entries(result.worst)) {
      const ok = gap <= options.tolerance;
      if (!ok) failures += 1;
      console.log(`${ok ? "ok   " : "FAIL "} ${path.basename(file)} ${result.format} ${region}: worst edge gap ${gap.toFixed(2)} units at t=${at}`);
    }
  }
} finally {
  await browser.close();
}
process.exitCode = failures ? 1 : 0;

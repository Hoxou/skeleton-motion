#!/usr/bin/env node
// Renders an animated SVG at evenly spaced instants into one PNG strip, so a
// motion can be reviewed (by a person or a vision model) without playing it.
//
//   node scripts/frame-strip.mjs out.png a.svg [b.svg ...] [--frames 6] [--width 360]
//
// Each input becomes one row; SMIL is paused and seeked per frame.

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? Number(args.splice(index, 2)[1]) : fallback;
};
const frames = option("frames", 6);
const width = option("width", 360);
const [output, ...inputs] = args;
if (!output || inputs.length === 0) {
  console.error("usage: frame-strip.mjs out.png a.svg [b.svg ...] [--frames 6] [--width 360]");
  process.exit(1);
}

const svgs = await Promise.all(inputs.map(async (file) => ({ data: await fs.readFile(file, "utf8"), name: path.basename(file) })));
const html = `<!doctype html><style>body{margin:0;background:#e9ebef;font:11px system-ui}.row{display:flex;gap:6px;padding:6px}.cell{width:${width}px}.cell svg{width:100%;height:auto;display:block;background:#fff;border-radius:6px}.name{padding:2px 6px;color:#556}</style>
${svgs.map((svg, row) => `<div class="name">${svg.name}</div><div class="row">${Array.from({ length: frames }, (_, index) => `<div class="cell" data-row="${row}" data-frame="${index}">${svg.data.replace(/^<\?xml[^>]*>/, "")}</div>`).join("")}</div>`).join("")}`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { height: 800, width: Math.max(800, frames * (width + 6) + 12) } });
  await page.setContent(html);
  await page.evaluate((count) => {
    for (const cell of document.querySelectorAll(".cell")) {
      const svg = cell.querySelector("svg");
      const animation = svg.querySelector("animate, animateTransform, animateMotion");
      const duration = animation ? Number.parseFloat(animation.getAttribute("dur")) || 1 : 1;
      svg.pauseAnimations();
      // Frames sample the loop from its start to just before it repeats.
      svg.setCurrentTime((duration * Number(cell.dataset.frame)) / count);
    }
  }, frames);
  await page.screenshot({ fullPage: true, path: output });
  console.log(output);
} finally {
  await browser.close();
}

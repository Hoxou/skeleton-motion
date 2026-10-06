import assert from "node:assert/strict";
import test from "node:test";
import { planScene } from "../src/plan.js";
import { renderPreview } from "../src/preview.js";
import { renderSvg } from "../src/render-svg.js";

const analysis = {
  concepts: {
    evidence: [{ file: "scenario-canvas.tsx", kind: "flow", score: 80 }],
    ranked: [{ kind: "flow", score: 80 }],
  },
  palettes: {
    dark: { accent: "#586df7", background: "#111", border: "#333", foreground: "#fafafa", muted: "#27272a", mutedForeground: "#a1a1aa", radius: "0rem", surface: "#202024" },
    light: { accent: "#142ce3", background: "#fff", border: "#e5e7eb", foreground: "#171717", muted: "#f4f4f5", mutedForeground: "#71717a", radius: "0rem", surface: "#fff" },
  },
  slug: "qa-segnatura",
  source: { input: "/repo", type: "repository" },
  typography: { family: "DM Sans", stack: '"DM Sans", ui-sans-serif, system-ui, sans-serif' },
  visual: { backdrop: "dots" },
};

test("plans one compact scene and preserves square geometry", () => {
  const scene = planScene(analysis, { concept: "auto", duration: 5, height: 675, width: 1200 }, "light");
  assert.equal(scene.concept, "flow");
  assert.equal(scene.containers, 5);
  assert.equal(scene.palette.radius, 0);
  assert.equal(scene.backdrop, "dots");
});

test("renders a self-contained animated SVG at requested resolution", () => {
  const scene = planScene(analysis, { concept: "auto", duration: 5, height: 900, width: 1600 }, "dark");
  const svg = renderSvg(scene);
  assert.match(svg, /width="1600" height="900"/);
  assert.match(svg, /viewBox="0 0 720 405"/);
  assert.match(svg, /#586df7/);
  assert.match(svg, /fill="var\(--accent\)" stroke="var\(--cursor-outline\)"/);
  assert.match(svg, /M2\.5 2 V27 L10 19\.8 H21\.5 Z/);
  assert.match(svg, /id="inserted-card"/);
  assert.match(svg, /stroke-dasharray="7 6"/);
  assert.match(svg, /values="0 56;0 56;0 -2;0 0;0 0;0 56"/);
  assert.match(svg, /id="step-picker"/);
  assert.match(svg, /id="clicked-option"/);
  assert.match(svg, /values="0;0;\.08;\.42;\.16;0;0"/);
  assert.doesNotMatch(svg, /type="scale" values="\.638/);
  assert.match(svg, /keySplines="\.22 \.8 \.2 1/);
  assert.doesNotMatch(svg, /stroke-dashoffset/);
  assert.match(svg, /repeatCount="indefinite"/);
  assert.match(svg, /<rect width="720" height="405" fill="url\(#dots\)"/);
  assert.doesNotMatch(svg, /<rect width="1600" height="900" fill="var\(--background\)"/);
  assert.doesNotMatch(svg, /x="24" y="22" width="672" height="361"/);
  assert.doesNotMatch(svg, /<script|href="https?:\/\//);
});

test("uses ambient flow motion without a cursor or zoom for run views", () => {
  const runAnalysis = structuredClone(analysis);
  runAnalysis.concepts.evidence = [{ file: "automations/runs/run-step-canvas.tsx", kind: "flow", score: 80 }];
  const scene = planScene(runAnalysis, { concept: "flow", duration: 5, height: 405, width: 720 }, "dark");
  const svg = renderSvg(scene);

  assert.equal(scene.motion, "route-propagation");
  assert.deepEqual(scene.motionProfile, {
    camera: "static",
    emphasis: "path-trace",
    name: "route-propagation",
    pointer: "none",
  });
  assert.equal(scene.backdrop, "dots");
  assert.doesNotMatch(svg, /id="cursor"|1\.055/);
});

test("keeps an asset unframed when the source has no authored backdrop", () => {
  const plainAnalysis = structuredClone(analysis);
  plainAnalysis.visual.backdrop = "none";
  const scene = planScene(plainAnalysis, { concept: "flow", duration: 5, height: 405, width: 720 }, "light");
  const svg = renderSvg(scene);

  assert.equal(scene.backdrop, "none");
  assert.doesNotMatch(svg, /<rect width="720" height="405" fill="url\(#dots\)"/);
});

test("uses voice-to-task motion without recycling cursor choreography", () => {
  const voiceAnalysis = structuredClone(analysis);
  voiceAnalysis.features = { voice: true };
  const scene = planScene(voiceAnalysis, { concept: "flow", duration: 5, height: 405, width: 720 }, "light");
  const svg = renderSvg(scene);

  assert.equal(scene.motion, "voice-to-task");
  assert.equal(scene.motionProfile.pointer, "none");
  assert.match(svg, /id="voice-control"/);
  assert.match(svg, /id="voice-updated-task"/);
  assert.doesNotMatch(svg, /id="cursor"/);
});

test("renders display-first landing-page context controls", () => {
  const light = { file: "flow.light.svg", theme: "light", viewport: { height: 405, width: 720 } };
  const dark = { file: "flow.dark.svg", theme: "dark", viewport: { height: 405, width: 720 } };
  const html = renderPreview({ name: "flow", scenes: [light, dark] });

  assert.match(html, /data-scene="display"/);
  assert.match(html, /data-scene-button="display" aria-pressed="true"/);
  assert.match(html, /data-scene-button="card"/);
  assert.match(html, /data-scene-button="split"/);
  assert.match(html, /data-scene-button="bento"/);
  assert.match(html, /data-asset-button="flow"/);
  assert.match(html, /href="\.\/flow\.assets\.zip" download/);
  assert.match(html, /--control-radius: 14px/);
  assert.match(html, /\.download[^}]*border-radius: var\(--control-radius\)/);
  assert.match(html, /\.option-button[^}]*background: color-mix/);
  assert.doesNotMatch(html, /\.asset-view\s*\{[^}]*background:/);
});

test("renders asset switching and a combined story without framing each asset", () => {
  const scene = (file, theme) => ({
    file,
    palette: analysis.palettes[theme],
    theme,
    typography: analysis.typography,
    viewport: { height: 405, width: 720 },
  });
  const html = renderPreview({
    assets: [
      { id: "add-step", label: "Add step", scenes: [scene("add.light.svg", "light"), scene("add.dark.svg", "dark")] },
      { id: "run-flow", label: "Run flow", scenes: [scene("run.light.svg", "light"), scene("run.dark.svg", "dark")] },
    ],
    fontFile: "qa.preview-font.ttf",
    name: "qa-set",
    zipFile: "qa-set.assets.zip",
  });

  assert.match(html, /data-asset-button="run-flow"/);
  assert.match(html, /data-scene-button="story"/);
  assert.match(html, /data-scene-panel="story"/);
  assert.match(html, /@font-face \{ font-family: "Source Preview"/);
  assert.match(html, /--accent: #142ce3/);
  assert.match(html, /--scene-radius: 0px/);
  assert.match(html, /href="\.\/qa-set\.assets\.zip" download/);
  assert.match(html, /\.asset-slot, \.asset-view \{ width: 100%; \}/);
});

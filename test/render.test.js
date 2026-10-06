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
    dark: { accent: "#586df7", background: "#111", border: "#333", foreground: "#fafafa", muted: "#27272a", radius: "0rem", surface: "#202024" },
    light: { accent: "#142ce3", background: "#fff", border: "#e5e7eb", foreground: "#171717", muted: "#f4f4f5", radius: "0rem", surface: "#fff" },
  },
  slug: "qa-segnatura",
  source: { input: "/repo", type: "repository" },
};

test("plans one compact scene and preserves square geometry", () => {
  const scene = planScene(analysis, { concept: "auto", duration: 5, height: 675, width: 1200 }, "light");
  assert.equal(scene.concept, "flow");
  assert.equal(scene.containers, 5);
  assert.equal(scene.palette.radius, 0);
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
  assert.match(svg, /keySplines="\.22 1 \.36 1/);
  assert.match(svg, /repeatCount="indefinite"/);
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
  assert.doesNotMatch(svg, /id="cursor"|1\.055/);
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
});

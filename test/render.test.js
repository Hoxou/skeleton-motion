import assert from "node:assert/strict";
import test from "node:test";
import { planScene } from "../src/plan.js";
import { renderPreview } from "../src/preview.js";
import { previewInputFromManifest, roomData } from "../src/room-data.js";
import { renderSvg } from "../src/render-svg.js";

const analysis = {
  concepts: {
    evidence: [{ file: "scenario-canvas.tsx", kind: "flow", score: 80 }],
    ranked: [{ kind: "flow", score: 80 }],
  },
  palettes: {
    dark: { accent: "#586df7", background: "#111", border: "#333", canvas: "#161620", foreground: "#fafafa", muted: "#27272a", mutedForeground: "#a1a1aa", radius: "0rem", surface: "#202024" },
    light: { accent: "#142ce3", background: "#fff", border: "#e5e7eb", canvas: "#f7f5ff", foreground: "#171717", muted: "#f4f4f5", mutedForeground: "#71717a", radius: "0rem", surface: "#fff" },
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
  assert.deepEqual(scene.composition, {
    backgroundOwner: "host",
    frame: "none",
    texture: "transparent-overlay",
  });
});

test("renders a self-contained animated SVG at requested resolution", () => {
  const scene = planScene(analysis, { concept: "auto", duration: 5, height: 900, width: 1600 }, "dark");
  const svg = renderSvg(scene);
  assert.match(svg, /width="1600" height="900"/);
  assert.match(svg, /viewBox="0 0 1778 1000"/);
  assert.match(svg, /#586df7/);
  assert.match(svg, /fill="var\(--accent\)" stroke="var\(--cursor-outline\)"/);
  assert.match(svg, /M2\.5 2 V27 L10 19\.8 H21\.5 Z/);
  assert.match(svg, /id="inserted-step"/);
  assert.match(svg, /stroke-dasharray="14 12"/);
  assert.match(svg, /id="add-step"/);
  assert.match(svg, /id="step-picker"/);
  assert.match(svg, /id="picked-option"/);
  assert.doesNotMatch(svg, /type="scale"/);
  assert.doesNotMatch(svg, /<clipPath|clip-path=/);
  assert.match(svg, /keySplines="\.22 \.8 \.2 1/);
  assert.doesNotMatch(svg, /stroke-dashoffset/);
  assert.match(svg, /repeatCount="indefinite"/);
  assert.match(svg, /<rect width="1778" height="1000" fill="url\(#dots\)"/);
  assert.doesNotMatch(svg, /<rect width="1600" height="900" fill="var\(--background\)"/);
  assert.doesNotMatch(svg, /<rect[^>]+fill="var\(--canvas\)"/);
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
    heroMotion: "traveling-signal",
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
  assert.equal(scene.composition.backgroundOwner, "host");
  assert.equal(scene.composition.texture, "none");
  assert.doesNotMatch(svg, /<rect width="720" height="405" fill="url\(#dots\)"/);
});

test("uses voice-to-task motion without recycling cursor choreography", () => {
  const voiceAnalysis = structuredClone(analysis);
  voiceAnalysis.features = { voice: true };
  const scene = planScene(voiceAnalysis, { concept: "flow", duration: 5, height: 405, width: 720 }, "light");
  const svg = renderSvg(scene);

  assert.equal(scene.motion, "voice-to-task");
  assert.equal(scene.motionProfile.pointer, "none");
  assert.equal(scene.motionProfile.heroMotion, "task-reorder");
  assert.equal(scene.motionProfile.timing, "overlap");
  assert.equal(scene.motionPhysics.energyPath, "voice-to-task");
  assert.deepEqual(scene.colorSemantics, {
    categories: "primary-tints",
    confirmation: "primary",
    decorativeCycling: false,
    signal: "primary",
  });
  assert.match(svg, /id="voice-control"/);
  assert.match(svg, /id="voice-waveform"/);
  assert.doesNotMatch(svg.match(/<g id="voice-waveform">[\s\S]*?<\/g>/)?.[0] || "", /fill="var\(--accent-[234]\)"/);
  assert.match(svg, /id="voice-updated-task"/);
  assert.match(svg.match(/<g id="voice-updated-task">[\s\S]*?<\/g>/)?.[0] || "", /<animate attributeName="y" values="[^"]+"/);
  assert.match(svg, /keyTimes="0;\.125;\.25;\.375;\.5;\.625;\.75;\.875;1"/);
  assert.doesNotMatch(svg, /id="cursor"/);
});

const roomDataOf = (html) => JSON.parse(html.match(/<script type="application\/json" id="room-data">([^<]*)<\/script>/)[1]);
const variant = (file, theme, extra = {}) => ({ file, theme, viewport: { height: 405, width: 720 }, ...extra });

test("ships the prebuilt room as one self-contained file with the run's data injected", () => {
  const html = renderPreview({ name: "flow", scenes: [variant("flow.light.svg", "light"), variant("flow.dark.svg", "dark")] });

  assert.match(html, /<title>Display Room - flow<\/title>/);
  assert.doesNotMatch(html, /<!--ROOM_DATA-->/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+rel="stylesheet"/);
  assert.match(html, /<script type="module">/);
  // Chrome font is inlined, never linked: the room is opened from disk.
  assert.match(html, /url\(data:font\/woff2;base64,/);
  assert.deepEqual(roomDataOf(html).assets, [{
    copy: { description: "A focused product motion composed for a landing-page feature.", eyebrow: "Product motion", title: "Show the useful moment." },
    id: "flow",
    label: "Flow",
    variants: [
      { file: "flow.light.svg", format: null, height: 405, theme: "light", width: 720 },
      { file: "flow.dark.svg", format: null, height: 405, theme: "dark", width: 720 },
    ],
  }]);
  assert.equal(roomDataOf(html).archive, "flow.assets.zip");
});

test("escapes labels so they cannot close the data script", () => {
  const html = renderPreview({ assets: [{ id: "a", label: "</script><b>x", scenes: [variant("a.light.svg", "light")] }], name: "a" });

  assert.equal(roomDataOf(html).assets[0].label, "</script><b>x");
});

test("passes source palette, font, and radius through for the stage only", () => {
  const scene = (file, theme) => variant(file, theme, { palette: analysis.palettes[theme], typography: analysis.typography });
  const data = roomData({
    assets: [
      { id: "add-step", label: "Add step", scenes: [scene("add.light.svg", "light"), scene("add.dark.svg", "dark")] },
      { id: "run-flow", label: "Run flow", scenes: [scene("run.light.svg", "light"), scene("run.dark.svg", "dark")] },
    ],
    fontFile: "qa.preview-font.ttf",
    name: "qa-set",
    zipFile: "qa-set.assets.zip",
  });

  assert.equal(data.source.light.accent, "#142ce3");
  assert.notEqual(data.source.dark, null);
  assert.equal(data.source.radius, 0);
  assert.equal(data.source.fontFile, "qa.preview-font.ttf");
  assert.deepEqual(data.assets.map((asset) => asset.id), ["add-step", "run-flow"]);
  assert.equal(data.archive, "qa-set.assets.zip");
});

test("drops dark tokens for a single-theme source and rejects unsafe CSS values", () => {
  const data = roomData({
    fontFile: "../evil.ttf",
    name: "flow",
    scenes: [variant("flow.light.svg", "light", { palette: { accent: "red;} body{display:none", background: "#fafafa" }, typography: { stack: "Inter</style>" } })],
  });

  assert.equal(data.source.dark, null);
  assert.equal(data.source.light.accent, "#4f46e5");
  assert.equal(data.source.light.page, "#fafafa");
  assert.equal(data.source.fontStack, "ui-sans-serif, system-ui, sans-serif");
  assert.equal(data.source.fontFile, null);
});

test("rebuilds preview input from a set manifest", () => {
  const manifest = {
    set: {
      archive: "s.assets.zip",
      assets: [{ copy: { title: "T" }, id: "s.one", label: "One", variants: [variant("s.one.light.svg", "light", { format: "16:9" }), variant("s.one.1x1.light.svg", "light", { format: "1:1" })] }],
      name: "s",
      preview: "s.preview.html",
    },
  };
  const input = previewInputFromManifest(manifest, "s.manifest.json");

  assert.equal(input.previewFile, "s.preview.html");
  assert.deepEqual(roomData(input).assets[0].variants.map((item) => item.format), ["16:9", "1:1"]);
});

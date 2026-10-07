import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ASPECTS, FORMATS, frameFor } from "../src/layout/formats.js";
import { planScene } from "../src/plan.js";
import { renderSvg } from "../src/render-svg.js";

const palette = { accent: "#4f46e5", background: "#fff", border: "#e5e7eb", colorMode: "monochrome", foreground: "#171717", muted: "#f4f4f5", mutedForeground: "#71717a", radius: "12px", surface: "#fff" };
const STORIES = [
  { concept: "flow", evidence: [{ file: "scenario-canvas.tsx", kind: "flow", score: 1 }], motion: "add-step" },
  { concept: "flow", evidence: [{ file: "voice-capture.tsx", kind: "flow", score: 1 }], features: { voice: true }, motion: "voice-to-task" },
  { concept: "list", motion: "select-and-reveal" },
  { concept: "editor", motion: "focus-and-confirm" },
  { concept: "dashboard", motion: "chart-sweep" },
  { concept: "palette", motion: "assign-color" },
  { concept: "layout", motion: "snap-to-grid" },
];

function plan(story, id) {
  const analysis = {
    concepts: { evidence: story.evidence || [], ranked: [{ kind: story.concept, score: 1 }] },
    features: story.features || {},
    palettes: { light: palette },
    slug: "kit",
    source: { input: "/repo", type: "repository" },
    typography: {},
    visual: { backdrop: "dots" },
  };
  return planScene(analysis, { concept: story.concept, format: FORMATS[id], story: { concept: story.concept, evidence: story.evidence || [], id: story.motion } }, "light");
}

const numbers = (tag, name) => Number(tag.match(new RegExp(`\\s${name}="(-?[\\d.]+)"`))?.[1]);

test("every story is composed natively in every default format", () => {
  for (const story of STORIES) {
    for (const id of DEFAULT_ASPECTS) {
      const scene = plan(story, id);
      const frame = frameFor(scene.format);
      const svg = renderSvg(scene);
      assert.equal(scene.motion, story.motion);
      assert.equal(scene.composed, true, `${story.motion} ${id}`);
      assert.match(svg, new RegExp(`viewBox="0 0 ${frame.width} ${frame.height}"`), `${story.motion} ${id}`);
      assert.doesNotMatch(svg, /<clipPath|clip-path=|type="scale"|url\(#glow\)/, `${story.motion} ${id} crops, scales, or glows`);
    }
  }
});

test("every story opens with its fill regions full and inside the shared safe area", () => {
  for (const story of STORIES) {
    for (const id of DEFAULT_ASPECTS) {
      const scene = plan(story, id);
      const { safe } = frameFor(scene.format);
      const svg = renderSvg(scene);
      const { regions } = JSON.parse(svg.match(/<metadata id="skeleton-layout">([^<]+)<\/metadata>/)[1]);
      for (const [name, region] of Object.entries(regions)) {
        assert.ok(region.x >= safe.x - 0.01 && region.y >= safe.y - 0.01 && region.x + region.width <= safe.x + safe.width + 0.01 && region.y + region.height <= safe.y + safe.height + 0.01, `${story.motion} ${id} ${name} leaves the safe area`);
        const tags = [...svg.matchAll(new RegExp(`<rect [^>]*data-fill="${name}"[^>]*>`, "g"))].map(([tag]) => tag);
        if (tags.length === 0) continue;
        const rects = tags.map((tag) => ({ height: numbers(tag, "height"), width: numbers(tag, "width"), x: numbers(tag, "x"), y: numbers(tag, "y") })).filter((rect) => rect.width > 0.01 && rect.height > 0.01);
        const left = Math.min(...rects.map((rect) => rect.x));
        const top = Math.min(...rects.map((rect) => rect.y));
        const right = Math.max(...rects.map((rect) => rect.x + rect.width));
        const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
        for (const [edge, gap] of Object.entries({ bottom: region.y + region.height - bottom, left: left - region.x, right: region.x + region.width - right, top: top - region.y })) {
          assert.ok(Math.abs(gap) < 0.05, `${story.motion} ${id} ${name} ${edge} gap ${gap.toFixed(2)}`);
        }
      }
    }
  }
});

test("stories in one set loop at different lengths", () => {
  const durations = STORIES.map((story) => plan(story, "16:9").duration);
  assert.equal(new Set(durations).size, durations.length, durations.join(", "));
});

test("assign-color answers every listed pick with its own click, ring, and shape color", () => {
  const multicolor = { ...palette, accents: ["#1437f5", "#f5b400", "#14a05a", "#111114"], colorMode: "multicolor", pastels: ["#1437f5", "#f5b400", "#14a05a", "#111114"] };
  const analysis = { concepts: { evidence: [], ranked: [] }, features: {}, palettes: { light: multicolor }, slug: "kit", source: { input: "/repo" }, typography: {}, visual: {} };
  const story = { concept: "palette", evidence: [], id: "assign-color", picks: [1, 2, 0] };
  const svg = renderSvg(planScene(analysis, { concept: "palette", duration: 8.4, format: FORMATS["16:9"], story }, "light"));
  assert.equal(svg.match(/class="ln-cursor-ripple"/g).length, 3);
  assert.equal(svg.match(/fill="none" class="ln-strong" stroke="var\(--accent\)"/g).length, 3);
  // Canvas shape layers are the circles whose opacity and radius both animate.
  const shapeLayer = (tag) => new RegExp(`<circle opacity="[\\d.]+" r="[\\d.]+" [^>]*fill="var\\(--tag-${tag}\\)"`);
  for (const tag of [1, 2, 3]) assert.match(svg, shapeLayer(tag), `shape layer for swatch ${tag}`);
  assert.doesNotMatch(svg, shapeLayer(4), "unpicked swatch must not get a shape layer");
  assert.doesNotMatch(svg, /<circle opacity="[\d.]+" r="[\d.]+" [^>]*stroke=/, "canvas shape has no outline");
});

test("assign-color without picks keeps the single tint pick", () => {
  const svg = renderSvg(plan({ concept: "palette", motion: "assign-color" }, "16:9"));
  assert.equal(svg.match(/class="ln-cursor-ripple"/g).length, 1);
  assert.equal(svg.match(/fill="none" class="ln-strong" stroke="var\(--accent\)"/g).length, 1);
});

// Regression: `<g data-drag>` rendered fine inlined in HTML but broke every
// <img> embed, which parses the file as XML and rejects valueless attributes.
test("every composed asset is well-formed XML for <img> embeds", () => {
  const attributes = /^<[\w:-]+((\s+[\w:-]+="[^"]*")*)\s*\/?>$/;
  for (const story of STORIES) {
    for (const id of DEFAULT_ASPECTS) {
      for (const [tag] of renderSvg(plan(story, id)).matchAll(/<[a-zA-Z][^>]*>/g)) {
        assert.match(tag, attributes, `${story.motion} ${id}: ${tag.slice(0, 80)}`);
      }
    }
  }
});

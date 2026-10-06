import assert from "node:assert/strict";
import test from "node:test";
import { createTimeline } from "../src/compose/tracks.js";
import { DEFAULT_ASPECTS, FORMATS } from "../src/layout/formats.js";
import { planScene } from "../src/plan.js";
import { renderSvg } from "../src/render-svg.js";

const keys = [{ at: 0 }, { at: 0.25 }, { at: 0.5 }, { at: 0.75 }, { at: 1 }];

test("a motion that passes another track's beat plays as one eased segment", () => {
  const markup = createTimeline(keys, 4).animate("x", [0, 0, 5, 10, 10]);

  assert.match(markup, /values="0;0;10;10"/);
  assert.match(markup, /keyTimes="0;\.25;\.75;1"/);
  assert.equal(markup.match(/keySplines="([^"]+)"/)[1].split(";").length, 3);
});

test("real turning points such as overshoot, settle, and holds are kept", () => {
  const markup = createTimeline(keys, 4).animate("y", [0, 12, 10, 10, 0]);

  assert.match(markup, /values="0;12;10;10;0"/);
});

test("a move written in two same-direction steps plays as one", () => {
  const markup = createTimeline(keys, 4).animate("y", [0, 4, 10, 10, 0]);

  assert.match(markup, /values="0;10;10;0"/);
  assert.match(markup, /keyTimes="0;\.5;\.75;1"/);
});

// Regression for lag: every segment eases out to zero speed, so a keyframe in
// the middle of a move that keeps its direction stops the move half-way.
// Direction changes (anticipation, overshoot) and holds are fine.
test("no composed asset stops a motion mid-way at a beat it does not own", () => {
  const stories = [
    ["flow", [{ file: "canvas.tsx", kind: "flow", score: 1 }], {}],
    ["flow", [{ file: "voice.tsx", kind: "flow", score: 1 }], { voice: true }],
    ["list", [], {}], ["editor", [], {}], ["dashboard", [], {}], ["palette", [], {}], ["layout", [], {}],
  ];
  const palette = { accent: "#4f46e5", background: "#fff", border: "#e5e7eb", foreground: "#171717", muted: "#f4f4f5", radius: "12px", surface: "#fff" };
  for (const [concept, evidence, features] of stories) {
    for (const id of DEFAULT_ASPECTS) {
      const analysis = { concepts: { evidence, ranked: [{ kind: concept, score: 1 }] }, features, palettes: { light: palette }, slug: "t", source: { input: "/r" }, typography: {}, visual: { backdrop: "none" } };
      const svg = renderSvg(planScene(analysis, { concept, format: FORMATS[id], story: { concept, evidence, id: concept } }, "light"));
      for (const [tag] of svg.matchAll(/<animate attributeName="(?!d")[^"]+" values="[^"]+" keyTimes="[^"]+" calcMode="spline"[^>]*>/g)) {
        const values = tag.match(/values="([^"]+)"/)[1].split(";").map(Number);
        const times = tag.match(/keyTimes="([^"]+)"/)[1].split(";").map(Number);
        for (let index = 1; index < values.length - 1; index += 1) {
          const into = values[index] - values[index - 1];
          const out = values[index + 1] - values[index];
          assert.ok(!(into * out > 1e-9), `${concept} ${id}: stall at ${times[index]} in ${tag.slice(0, 110)}`);
        }
      }
    }
  }
});

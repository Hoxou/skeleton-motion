import assert from "node:assert/strict";
import test from "node:test";
import { __testing, composeInsertStep } from "../src/compose/insert-step.js";
import { contains, edgeGaps, overlapArea } from "../src/layout/fill.js";
import { DEFAULT_ASPECTS, FORMATS } from "../src/layout/formats.js";
import { lerpRect } from "../src/layout/solve.js";
import { planScene } from "../src/plan.js";
import { renderSvg } from "../src/render-svg.js";

const { CARD, HANDOFF, OPTION } = __testing;

const analysis = {
  concepts: { evidence: [{ file: "scenario-canvas.tsx", kind: "flow", score: 80 }], ranked: [{ kind: "flow", score: 80 }] },
  palettes: {
    light: { accent: "#142ce3", background: "#fff", border: "#e5e7eb", foreground: "#171717", muted: "#f4f4f5", mutedForeground: "#71717a", radius: "8px", surface: "#fff" },
  },
  slug: "compose",
  source: { input: "/repo", type: "repository" },
  typography: {},
  visual: { backdrop: "dots" },
};

const TOLERANCE = 0.05;
const scenes = DEFAULT_ASPECTS.map((id) => planScene(analysis, { concept: "flow", format: FORMATS[id] }, "light"));
const composed = scenes.map((scene) => ({ model: composeInsertStep(scene).model, scene }));
const byFormat = Object.fromEntries(composed.map((entry) => [entry.scene.format.id, entry]));
const stepLayers = (model) => Object.entries(model.layers).filter(([id]) => id.startsWith("step-") || id === "inserted").map(([, layer]) => layer);

// SMIL spline segments with control points inside [0, 1] stay between their
// keyframe values, and every track shares one timeline, so blending all
// layers by the same weight reproduces any rendered instant.
function* instants(model) {
  for (let index = 0; index < model.keys.length - 1; index += 1) {
    for (const t of [0, 0.25, 0.5, 0.75]) {
      yield { index, label: `${model.keys[index].at}+${t}`, rect: (layer) => lerpRect(layer.frames[index], layer.frames[index + 1], t), t };
    }
  }
}

const visibleAt = (layer, index) => (layer.opacity?.[index] ?? 1) > 0;
const opacityAt = (layer, index) => layer.opacity?.[index] ?? 1;
// Visible throughout a segment, not merely fading in or out of it.
const settledAt = (layer, index) => opacityAt(layer, index) > 0 && opacityAt(layer, index + 1) > 0;
const fadingAt = (layer, index) => opacityAt(layer, index) !== opacityAt(layer, index + 1);

test("the 16:9 composition keeps the source rhythm: three steps beside the picker", () => {
  const { model } = byFormat["16:9"];
  assert.equal(model.arrangement.axis, "columns");
  assert.equal(model.sizes.count, 3);
  assert.equal(model.sizes.optionCount, 3);
  assert.ok(Math.abs(model.arrangement.gap - 34.5 / 80) < 0.01, `gap ratio ${model.arrangement.gap}`);
});

test("steps keep their source shape and options keep their natural height in every format", () => {
  for (const { model, scene } of composed) {
    for (const [id, layer] of Object.entries(model.layers)) {
      for (const rect of layer.frames) {
        if (layer.aspect) assert.ok(Math.abs(rect.width / rect.height - layer.aspect) < 0.01, `${scene.format.id} ${id} renders ${rect.width.toFixed(0)}x${rect.height.toFixed(0)}`);
      }
      if (layer.height) {
        assert.ok(layer.frames.every((rect) => Math.abs(rect.height - layer.height) < 0.01), `${scene.format.id} ${id} changes height`);
      }
    }
    assert.equal(model.layers["step-0"].aspect, CARD.width / CARD.height);
    const optionHeight = model.layers["option-0"].height / (1000 / 405);
    assert.ok([OPTION.height, 86].some((height) => Math.abs(optionHeight - height) < 0.01), `option is ${optionHeight} source px`);
  }
});

test("each frame shows a small cast instead of filling space with more items", () => {
  for (const { model, scene } of composed) {
    assert.ok(model.sizes.count >= 3 && model.sizes.count <= 4, `${scene.format.id} shows ${model.sizes.count} steps`);
    assert.ok(model.sizes.optionCount >= 2 && model.sizes.optionCount <= 3, `${scene.format.id} shows ${model.sizes.optionCount} options`);
  }
});

// While a navigating flow hands the frame to its picker, nothing settled is on
// screen; those segments are covered by the handoff test below.
test("the steps region stays full at every instant", () => {
  for (const { model, scene } of composed) {
    for (const instant of instants(model)) {
      const settled = stepLayers(model).filter((layer) => settledAt(layer, instant.index));
      if (settled.length === 0) continue;
      const rects = settled.map(instant.rect);
      for (const [edge, gap] of Object.entries(edgeGaps(rects, model.regions.steps))) {
        assert.ok(Math.abs(gap) < TOLERANCE, `${scene.format.id} ${edge} gap ${gap.toFixed(2)} at ${instant.label}`);
      }
    }
  }
});

test("docked pickers fill their region and the frame is tiled by regions", () => {
  for (const { model, scene } of composed) {
    if (model.arrangement.axis === "navigate") {
      assert.deepEqual(model.regions.steps, model.frame.safe, scene.format.id);
      continue;
    }
    for (const [edge, gap] of Object.entries(edgeGaps([model.regions.steps, model.regions.picker], model.frame.safe))) {
      assert.ok(Math.abs(gap) < TOLERANCE, `${scene.format.id} regions ${edge} gap ${gap}`);
    }
    const options = Object.entries(model.layers).filter(([id]) => id.startsWith("option-")).map(([, layer]) => layer.frames[0]);
    for (const [edge, gap] of Object.entries(edgeGaps(options, model.regions.list))) {
      assert.ok(Math.abs(gap) < TOLERANCE, `${scene.format.id} options ${edge} gap ${gap}`);
    }
  }
});

// Exits and entrances drift into the frame margin while they fade; content at
// rest stays inside the safe area.
test("nothing leaves the frame and steps never collide", () => {
  for (const { model, scene } of composed) {
    const bounds = { height: model.frame.height, width: model.frame.width, x: 0, y: 0 };
    for (const instant of instants(model)) {
      for (const [id, layer] of Object.entries(model.layers)) {
        if (!visibleAt(layer, instant.index) && !visibleAt(layer, instant.index + 1)) continue;
        const area = fadingAt(layer, instant.index) ? bounds : model.frame.safe;
        assert.ok(contains(area, instant.rect(layer), TOLERANCE), `${scene.format.id} ${id} leaves the ${fadingAt(layer, instant.index) ? "frame" : "safe area"} at ${instant.label}`);
      }
      const steps = stepLayers(model).map(instant.rect);
      for (let left = 0; left < steps.length; left += 1) {
        for (let right = left + 1; right < steps.length; right += 1) {
          assert.ok(overlapArea(steps[left], steps[right]) < TOLERANCE, `${scene.format.id} steps ${left}/${right} overlap at ${instant.label}`);
        }
      }
    }
  }
});

// Replacing content must not cover it: what leaves is gone before what
// arrives is drawn, in both directions of the handoff.
test("the picker and the steps it shares space with are never visible over each other", () => {
  for (const { model, scene } of composed) {
    const picker = model.layers.picker;
    for (const instant of instants(model)) {
      if (!visibleAt(picker, instant.index) && !visibleAt(picker, instant.index + 1)) continue;
      for (const [id, layer] of Object.entries(model.layers)) {
        if (!id.startsWith("step-") && id !== "inserted") continue;
        if (!visibleAt(layer, instant.index) && !visibleAt(layer, instant.index + 1)) continue;
        assert.ok(overlapArea(instant.rect(picker), instant.rect(layer)) < TOLERANCE, `${scene.format.id} picker covers ${id} at ${instant.label}`);
      }
    }
  }
});

test("a navigating flow returns to exactly where it left", () => {
  for (const { model, scene } of composed.filter(({ model }) => model.arrangement.axis === "navigate")) {
    const leave = model.keys.findIndex(({ at }) => at === HANDOFF.leave);
    const back = model.keys.findIndex(({ at }) => at === HANDOFF.back);
    for (const layer of stepLayers(model)) {
      assert.deepEqual(layer.frames[back], layer.frames[leave], scene.format.id);
      assert.equal(opacityAt(layer, back), opacityAt(layer, leave), scene.format.id);
    }
    assert.ok(stepLayers(model).every((layer) => opacityAt(layer, model.keys.findIndex(({ at }) => at === HANDOFF.gone)) === 0), `${scene.format.id} flow still visible when the picker arrives`);
  }
});

test("card content keeps its proportions inside its card", () => {
  for (const { model, scene } of composed) {
    for (const layer of stepLayers(model)) {
      layer.frames.forEach((card, index) => {
        const content = layer.content[index];
        assert.ok(contains(card, content, TOLERANCE), `${scene.format.id} content spills at keyframe ${index}`);
        if (content.height > 1) assert.ok(Math.abs(content.width / content.height - CARD.width / CARD.height) < 0.01, `${scene.format.id} content stretched`);
      });
    }
  }
});

test("formats stage the same story differently and loop at their own pace", () => {
  assert.equal(byFormat["16:9"].model.arrangement.axis, "columns");
  assert.equal(byFormat["9:16"].model.arrangement.axis, "rows");
  assert.equal(byFormat["1:1"].model.arrangement.axis, "navigate");
  assert.equal(new Set(scenes.map((scene) => scene.duration)).size, scenes.length);
});

test("composed assets compute geometry instead of cropping or scaling, with valid timelines", () => {
  for (const scene of scenes) {
    const svg = renderSvg(scene);
    assert.doesNotMatch(svg, /<clipPath|clip-path=|type="scale"/, scene.format.id);
    for (const [, list] of svg.matchAll(/keyTimes="([^"]+)"/g)) {
      const times = list.split(";").map(Number);
      assert.equal(times[0], 0);
      assert.equal(times.at(-1), 1);
      assert.ok(times.every((time, index) => index === 0 || time >= times[index - 1]), `${scene.format.id}: ${list}`);
    }
  }
});

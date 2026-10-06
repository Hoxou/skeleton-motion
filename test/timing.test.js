import assert from "node:assert/strict";
import test from "node:test";
import { parseArgs } from "../src/args.js";
import { planScene } from "../src/plan.js";
import { renderSvg } from "../src/render-svg.js";
import { planAssetSet } from "../src/set.js";

const analysis = {
  concepts: {
    evidence: [],
    ranked: [
      { kind: "flow", score: 400 },
      { kind: "list", score: 300 },
      { kind: "editor", score: 200 },
      { kind: "dashboard", score: 100 },
    ],
  },
  palettes: {
    light: { accent: "#142ce3", background: "#fff", border: "#e5e7eb", foreground: "#171717", muted: "#f4f4f5", mutedForeground: "#71717a", radius: "8px", surface: "#fff" },
  },
  slug: "timing",
  source: { input: "/repo", type: "repository" },
  typography: {},
  visual: { backdrop: "none" },
};

function planSet(options = {}) {
  return planAssetSet(analysis, { concept: "auto", count: 4, set: true }).map((story) =>
    planScene(analysis, { concept: story.concept, height: 405, story, width: 720, ...options }, "light"));
}

// The last authored beat before each loop resets; identical values mean the set breathes in lockstep.
function resetBeat(svg) {
  const times = [...svg.matchAll(/keyTimes="([^"]+)"/g)].flatMap(([, list]) => list.split(";").map(Number));
  return Math.max(...times.filter((time) => time < 1));
}

test("duration defaults to the motion instead of a global constant", () => {
  assert.equal(parseArgs(["../app"]).duration, undefined);
  assert.equal(parseArgs(["../app", "--duration", "4"]).duration, 4);
});

test("each asset in a set gets its own loop length", () => {
  const durations = planSet().map((scene) => scene.duration);

  assert.equal(new Set(durations).size, durations.length, `durations repeat: ${durations.join(", ")}`);
  assert.ok(durations.every((duration) => duration >= 3.5 && duration <= 9));
});

test("each asset in a set uses its own beat rhythm", () => {
  const beats = planSet().map((scene) => resetBeat(renderSvg(scene)));

  assert.equal(new Set(beats).size, beats.length, `reset beats repeat: ${beats.join(", ")}`);
});

test("an explicit duration is honored exactly", () => {
  assert.ok(planSet({ duration: 5 }).every((scene) => scene.duration === 5));
});

test("warped keyTimes stay valid SMIL timelines", () => {
  for (const scene of planSet()) {
    const svg = renderSvg(scene);
    for (const [, list] of svg.matchAll(/keyTimes="([^"]+)"/g)) {
      const times = list.split(";").map(Number);
      assert.equal(times[0], 0);
      assert.equal(times.at(-1), 1);
      assert.ok(times.every((time, index) => index === 0 || time >= times[index - 1]), `${scene.motion}: ${list}`);
    }
    assert.match(svg, new RegExp(`dur="${scene.duration}s"`));
  }
});

test("the studio asset concepts also stay valid SMIL timelines", () => {
  const studioStories = [
    { concept: "palette", copy: {}, id: "assign-color" },
    { concept: "layout", copy: {}, id: "snap-to-grid" },
  ];
  for (const story of studioStories) {
    const scene = planScene(analysis, { concept: story.concept, height: 675, story, width: 1200 }, "light");
    const svg = renderSvg(scene);
    for (const [, list] of svg.matchAll(/keyTimes="([^"]+)"/g)) {
      const times = list.split(";").map(Number);
      assert.equal(times[0], 0, `${scene.motion}: ${list}`);
      assert.equal(times.at(-1), 1, `${scene.motion}: ${list}`);
      assert.ok(times.every((time, index) => index === 0 || time >= times[index - 1]), `${scene.motion}: ${list}`);
    }
    assert.match(svg, new RegExp(`dur="${scene.duration}s"`));
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { planAssetSet } from "../src/set.js";

const analysis = {
  concepts: {
    ranked: [
      { kind: "list", score: 400 },
      { kind: "flow", score: 300 },
      { kind: "editor", score: 200 },
      { kind: "dashboard", score: 100 },
    ],
  },
};

test("plans a stable, distinct full set in source relevance order", () => {
  const stories = planAssetSet(analysis, { concept: "auto", count: 4, set: true });

  assert.deepEqual(stories.map((story) => story.concept), ["list", "flow", "editor", "dashboard"]);
  assert.equal(new Set(stories.map((story) => story.id)).size, 4);
  assert.ok(stories.every((story) => story.copy.title && story.copy.description));
});

test("preserves focused single-asset planning when set mode is off", () => {
  const stories = planAssetSet(analysis, { concept: "flow", set: false });

  assert.equal(stories.length, 1);
  assert.equal(stories[0].concept, "flow");
});

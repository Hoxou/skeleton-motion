import assert from "node:assert/strict";
import test from "node:test";
import { edgeGaps } from "../src/layout/fill.js";
import { customFormat, DEFAULT_ASPECTS, FORMATS, frameFor, parseAspect, viewportFor } from "../src/layout/formats.js";
import { lerpRect, solve } from "../src/layout/solve.js";

const region = { height: 600, width: 400, x: 50, y: 40 };
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.01, `${message}: ${actual} != ${expected}`);
const assertFull = (rects, message) => {
  for (const [edge, gap] of Object.entries(edgeGaps(rects, region))) near(gap, 0, `${message} ${edge}`);
};

test("growing children always fill the region along both axes", () => {
  const rects = solve({ axis: "y", children: [{ id: "a" }, { id: "b" }], gap: 20 }, region);

  assertFull(Object.values(rects), "two cards");
  near(rects.a.height, 290, "equal share");
  near(rects.b.y - (rects.a.y + rects.a.height), 20, "gap");
});

test("a collapsed child takes its gaps with it so no edge strip stays blank", () => {
  const stack = (presence) => solve({ axis: "y", children: [{ id: "a" }, { id: "n", presence: presence.n }, { id: "b", presence: presence.b }], gap: 20 }, region);

  near(stack({ b: 0, n: 0 }).a.height, region.height, "single survivor fills");
  const split = stack({ b: 1, n: 0 });
  assertFull([split.a, split.b], "split");
  near(split.b.y - (split.a.y + split.a.height), 40, "collapsed middle keeps both gaps as one seam");
  near(split.n.height, 0, "collapsed middle has no height");
});

test("interpolating between two solved states never opens an edge gap", () => {
  const before = solve({ axis: "y", children: [{ id: "a" }, { id: "n", presence: 0 }, { id: "b" }], gap: 20 }, region);
  const after = solve({ axis: "y", children: [{ id: "a" }, { id: "n" }, { id: "b" }], gap: 20 }, region);

  for (const t of [0, 0.2, 0.5, 0.8, 1]) {
    assertFull(["a", "n", "b"].map((id) => lerpRect(before[id], after[id], t)), `t=${t}`);
  }
});

test("aspect-locked ovals pin the outer edges and spend leftover space between them", () => {
  const rects = solve({ axis: "x", children: [1, 2, 3].map((id) => ({ aspect: 1, id: `o${id}` })), gap: 10 }, { height: 100, width: 600, x: 0, y: 0 });

  near(rects.o1.x, 0, "first pinned to start");
  near(rects.o3.x + rects.o3.width, 600, "last pinned to end");
  for (const id of ["o1", "o2", "o3"]) {
    near(rects[id].width, 100, `${id} keeps aspect`);
    near(rects[id].height, 100, `${id} fills the cross axis`);
  }
  near(rects.o2.x - (rects.o1.x + rects.o1.width), rects.o3.x - (rects.o2.x + rects.o2.width), "even spacing");
});

test("nested stacks keep every level full", () => {
  const rects = solve({ axis: "x", children: [{ id: "left" }, { axis: "y", children: [{ id: "top" }, { id: "bottom", grow: 2 }], gap: 12, grow: 1.4 }], gap: 24 }, region);

  assertFull(Object.values(rects), "nested");
  near(rects.bottom.height, rects.top.height * 2, "grow weights");
});

test("every format shares one inset proportion and a matching viewport", () => {
  assert.deepEqual([...DEFAULT_ASPECTS], ["16:9", "4:3", "1:1", "4:5", "9:16"]);
  for (const id of DEFAULT_ASPECTS) {
    const frame = frameFor(FORMATS[id]);
    const viewport = viewportFor(FORMATS[id]);
    assert.equal(Math.min(frame.width, frame.height), 1000, id);
    assert.equal(frame.inset / Math.min(frame.width, frame.height), 0.1, id);
    near(viewport.width / viewport.height, frame.width / frame.height, `${id} viewport`);
  }
  assert.equal(parseAspect("21:9").layout, "wide");
  assert.equal(customFormat(1000, 1000).layout, "square");
  assert.throws(() => parseAspect("wide"), /unsupported aspect/);
});

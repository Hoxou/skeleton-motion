import assert from "node:assert/strict";
import test from "node:test";
import { fillStack, stackRects, stackSlots } from "../src/compose/kit.js";

// Room for six 10-unit items at a 0.5 gap: 6 * 10 + 5 * 5 = 85.
test("a list takes as many items as fit at the source gap instead of spreading a few apart", () => {
  const stack = fillStack({ gap: 0.5, intrinsic: 10, length: 85, min: 3 });

  assert.equal(stack.count, 6);
  assert.ok(Math.abs(stack.gap - 0.5) < 1e-9);
  assert.ok(Math.abs(stack.size - 10) < 1e-9);
});

test("leftover space resizes items slightly before it widens gaps", () => {
  const stack = fillStack({ gap: 0.5, intrinsic: 10, length: 90, min: 3 });

  assert.ok(Math.abs(stack.gap - 0.5) < 1e-9, `gap ${stack.gap}`);
  assert.ok(stack.scale > 1 && stack.scale <= 1.15, `scale ${stack.scale}`);
});

// 88 holds six at a 0.56 gap or seven at 0.3; six is closer to the source.
test("fixed-size items absorb leftover in the gap, picking the count closest to the source rhythm", () => {
  const stack = fillStack({ gap: 0.5, intrinsic: 10, length: 88, minGap: 0, scaleRange: [1, 1] });

  assert.equal(stack.count, 6);
  assert.ok(stack.gap > 0.5 && stack.gap < 0.5 + 1.5 / 5, `gap ${stack.gap}`);
});

test("slots continue past both edges so a growing list can push one item out", () => {
  const region = { height: 85, width: 40, x: 0, y: 100 };
  const stack = fillStack({ gap: 0.5, intrinsic: 10, length: 85, min: 3 });
  const slot = stackSlots(region, "y", stack);
  const rects = stackRects(region, "y", stack);

  assert.deepEqual(rects[0], slot(0));
  assert.equal(rects.at(-1).y + rects.at(-1).height, 185);
  assert.equal(slot(stack.count).y, 190);
  assert.equal(slot(-1).y, 85);
});

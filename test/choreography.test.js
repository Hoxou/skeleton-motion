import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ASPECTS, FORMATS } from "../src/layout/formats.js";
import { planScene } from "../src/plan.js";
import { renderSvg } from "../src/render-svg.js";

const palette = { accent: "#4f46e5", background: "#fff", border: "#e5e7eb", colorMode: "monochrome", foreground: "#171717", muted: "#f4f4f5", mutedForeground: "#71717a", radius: "12px", surface: "#fff" };
const STORIES = [
  { concept: "flow", evidence: [{ file: "scenario-canvas.tsx", kind: "flow", score: 1 }], motion: "add-step" },
  { concept: "list", motion: "select-and-reveal" },
  { concept: "editor", motion: "focus-and-confirm" },
  { concept: "palette", motion: "assign-color" },
  { concept: "palette", motion: "assign-color", picks: [1, 2, 0] },
  { concept: "layout", motion: "snap-to-grid" },
];
const UNATTENDED = [
  { concept: "flow", evidence: [{ file: "voice-capture.tsx", kind: "flow", score: 1 }], features: { voice: true }, motion: "voice-to-task" },
  { concept: "dashboard", motion: "chart-sweep" },
];
// Two moves closer than this read as simultaneous.
const OVERLAP = 0.003;

function render(story, id) {
  const analysis = { concepts: { evidence: story.evidence || [], ranked: [{ kind: story.concept, score: 1 }] }, features: story.features || {}, palettes: { light: palette }, slug: "kit", source: { input: "/repo", type: "repository" }, typography: {}, visual: { backdrop: "dots" } };
  return renderSvg(planScene(analysis, { concept: story.concept, format: FORMATS[id], story: { concept: story.concept, evidence: story.evidence || [], id: story.motion, picks: story.picks } }, "light"));
}

const attribute = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

// Every SMIL animation with the opening tags of the elements around it.
function animations(svg) {
  const open = [];
  const found = [];
  for (const [tag] of svg.matchAll(/<\/?[a-zA-Z][^>]*>/g)) {
    if (tag.startsWith("</")) {
      open.pop();
      continue;
    }
    if (/^<animate(Transform|Motion)?\s/.test(tag)) {
      found.push({
        attribute: attribute(tag, "attributeName"),
        name: tag.match(/^<(\w+)/)[1],
        times: attribute(tag, "keyTimes").split(";").map(Number),
        values: (attribute(tag, "values") ?? attribute(tag, "keyPoints")).split(";").map((value) => value.trim()),
        within: [...open],
      });
    }
    if (!tag.endsWith("/>")) open.push(tag);
  }
  return found;
}

const changing = (animation) => animation.times.slice(0, -1).flatMap((time, index) => (
  animation.values[index] === animation.values[index + 1] ? [] : [[time, animation.times[index + 1]]]
));
const overlap = ([a0, a1], [b0, b1]) => Math.min(a1, b1) - Math.max(a0, b0);

// A person moves the pointer, clicks, and watches the product answer before
// moving again. Ambient activity and anything being dragged move with it.
test("the pointer never travels while the product is moving", () => {
  for (const story of STORIES) {
    for (const id of DEFAULT_ASPECTS) {
      const label = `${story.motion}${story.picks ? ` ${story.picks}` : ""} ${id}`;
      const found = animations(render(story, id));
      const inCursor = (animation) => animation.within.some((tag) => /id="cursor"/.test(tag));
      const travel = found.find((animation) => inCursor(animation) && animation.name === "animateTransform");
      const visibility = found.find((animation) => inCursor(animation) && animation.attribute === "opacity" && /id="cursor"/.test(animation.within.at(-1)));
      assert.ok(travel, `${label} has a pointer`);
      const shown = visibility ? [visibility.times[1], visibility.times[2]] : [0, 1];
      const moves = changing(travel).filter((move) => overlap(move, shown) > 0);
      const product = found.filter((animation) => !inCursor(animation) && !animation.within.some((tag) => /data-(ambient|drag)/.test(tag)));
      for (const move of moves) {
        for (const animation of product) {
          for (const change of changing(animation)) {
            assert.ok(overlap(move, change) <= OVERLAP, `${label}: pointer travels ${move.join("-")} while ${animation.attribute} changes ${change.join("-")}`);
          }
        }
      }
    }
  }
});

// The pointer stays on screen across the loop seam, so it has to be back at
// its opening rest, and still, before the loop closes.
test("the pointer walks back to rest before the loop closes", () => {
  for (const story of STORIES) {
    for (const id of DEFAULT_ASPECTS) {
      const label = `${story.motion}${story.picks ? ` ${story.picks}` : ""} ${id}`;
      const found = animations(render(story, id));
      const inCursor = (animation) => animation.within.some((tag) => /id="cursor"/.test(tag));
      const visibility = found.find((animation) => inCursor(animation) && animation.attribute === "opacity" && /id="cursor"/.test(animation.within.at(-1)));
      const travel = found.find((animation) => inCursor(animation) && animation.name === "animateTransform");
      assert.equal(visibility, undefined, `${label} fades the pointer at the seam`);
      assert.equal(travel.values[0], travel.values.at(-1), `${label} pointer ends away from rest`);
      assert.equal(travel.values.at(-2), travel.values.at(-1), `${label} pointer is still moving at the seam`);
    }
  }
});

// Regression: stories used to end with every track fading and snapping back
// in the same beat. Each one now plays its change back to the opening frame
// and holds there, so the jump from the last frame to the first is invisible.
test("every story rewinds to its opening frame and holds still across the seam", () => {
  for (const story of [...STORIES, ...UNATTENDED]) {
    for (const id of DEFAULT_ASPECTS) {
      const label = `${story.motion}${story.picks ? ` ${story.picks}` : ""} ${id}`;
      const ambient = (animation) => animation.within.some((tag) => /id="voice-control"|ln-cursor-ripple/.test(tag));
      for (const animation of animations(render(story, id))) {
        assert.equal(animation.values[0], animation.values.at(-1), `${label} ${animation.attribute} ends at ${animation.values.at(-1)}, opens at ${animation.values[0]}`);
        if (ambient(animation)) continue;
        assert.equal(animation.values.at(-2), animation.values.at(-1), `${label} ${animation.attribute} still changing at the seam`);
      }
    }
  }
});

// Regression: the accent trend used to fade in whole while the marker was
// still travelling. It is now inked by the marker itself, on the same clock.
test("the chart is colored exactly up to the marker, there and back", () => {
  for (const id of DEFAULT_ASPECTS) {
    const svg = render(UNATTENDED[1], id);
    const motion = svg.match(/<animateMotion [^>]*>/)[0];
    const [path, ink] = svg.match(/<path [^>]*stroke-dasharray="[^"]*"[^>]*>\s*<animate [^>]*>/)?.[0].split("<animate") ?? [];
    assert.ok(ink, `${id} has no inked trace`);
    assert.doesNotMatch(ink, /attributeName="opacity"/, `${id} fades the trace`);
    for (const name of ["keyTimes", "keySplines", "dur"]) assert.equal(attribute(ink, name), attribute(motion, name), `${id} ${name} differs`);
    const length = Number(attribute(path, "stroke-dasharray").split(" ")[0]);
    const points = attribute(motion, "keyPoints").split(";").map(Number);
    const offsets = attribute(ink, "values").split(";").map(Number);
    offsets.forEach((offset, index) => assert.ok(Math.abs(offset - (1 - points[index]) * length) < 0.01, `${id} ink does not end under the marker at beat ${index}`));
    assert.ok(points.includes(1) && points[0] === 0 && points.at(-1) === 0, `${id} marker does not travel there and back`);
  }
});

// Regression: the dragged shape ran on the shared timeline, where its lift
// merged into the drag, so it eased over a longer span than the pointer and
// slid out from under it. A carried element now shares the pointer's track.
test("a dragged element moves on the pointer's exact timing and easing", () => {
  const story = STORIES.find(({ motion }) => motion === "snap-to-grid");
  for (const id of DEFAULT_ASPECTS) {
    const found = animations(render(story, id));
    const translate = (inside) => found.find((animation) => animation.name === "animateTransform" && animation.within.some(inside));
    const pointer = translate((tag) => /id="cursor"/.test(tag));
    const dragged = translate((tag) => /data-drag/.test(tag));
    assert.ok(dragged, `${id} dragged element has no translate track`);
    const svg = render(story, id);
    const splines = (within) => svg.match(new RegExp(`${within}[\\s\\S]*?<animateTransform [^>]*keySplines="([^"]+)"`))[1];
    assert.deepEqual(dragged.times, pointer.times, `${id} keyTimes differ`);
    assert.equal(splines("data-drag"), splines('id="cursor"'), `${id} easing differs`);
    const delta = (values, index) => {
      const [x0, y0] = values[index].split(" ").map(Number);
      const [x1, y1] = values[index + 1].split(" ").map(Number);
      return [x1 - x0, y1 - y0];
    };
    let carried = 0;
    for (let index = 0; index < dragged.values.length - 1; index += 1) {
      const [dx, dy] = delta(dragged.values, index);
      if (Math.hypot(dx, dy) < 0.01) continue;
      carried += 1;
      const [px, py] = delta(pointer.values, index);
      assert.ok(Math.abs(dx - px) < 0.02 && Math.abs(dy - py) < 0.02, `${id} segment ${index}: shape moves ${dx},${dy}, pointer ${px},${py}`);
    }
    assert.equal(carried, 2, `${id} expected a drag there and a drag back`);
  }
});

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
// Two moves closer than this read as simultaneous.
const OVERLAP = 0.003;

function render(story, id) {
  const analysis = { concepts: { evidence: story.evidence || [], ranked: [{ kind: story.concept, score: 1 }] }, features: {}, palettes: { light: palette }, slug: "kit", source: { input: "/repo", type: "repository" }, typography: {}, visual: { backdrop: "dots" } };
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
      assert.ok(travel && visibility, `${label} has a pointer`);
      const shown = [visibility.times[1], visibility.times[2]];
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

test("the pointer is gone before a story resets", () => {
  for (const story of STORIES) {
    for (const id of DEFAULT_ASPECTS) {
      const found = animations(render(story, id));
      const visibility = found.find((animation) => animation.attribute === "opacity" && /id="cursor"/.test(animation.within.at(-1)));
      const travel = found.find((animation) => animation.name === "animateTransform" && animation.within.some((tag) => /id="cursor"/.test(tag)));
      const lastMove = changing(travel).at(-1);
      assert.ok(lastMove[0] >= visibility.times[3] - OVERLAP, `${story.motion} ${id} returns to rest while visible`);
    }
  }
});

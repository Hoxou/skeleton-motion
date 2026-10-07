import { frameFor } from "../layout/formats.js";
import { inset, solve } from "../layout/solve.js";
import { cursor } from "../render-svg.js";
import { escapeXml } from "../utils.js";
import { backdrop, layoutMetadata, sourceUnits, storyClock } from "./kit.js";
import { createTimeline, formatNumber, rectTracks } from "./tracks.js";

// Generic composer for model-authored scene plans (see src/scene-plan.js).
// A plan is a cast of elements and an ordered list of UI states, each a
// layout tree. Every state is solved per frame shape and the motion is the
// blend between consecutive solved layouts, so a plan never positions
// anything itself: entering items open space, moved items travel, and the
// pointer acts only while the UI is still.

// Natural sizes in source px. `width: "label"` sizes to the label text.
export const KINDS = Object.freeze({
  avatar: { height: 32, width: 32 },
  bar: { height: 10, width: 120 },
  button: { font: 12, height: 30, width: "label" },
  card: { font: 12, height: 68 },
  chart: { height: 116 },
  chip: { font: 11, height: 24, width: "label" },
  field: { font: 12, height: 34 },
  panel: { font: 12, header: 22, pad: 14 },
  row: { font: 12, height: 46 },
  text: { font: 17, height: 24, width: "label" },
});
const GAPS = Object.freeze({ loose: 22, normal: 12, tight: 6 });
const MIN_COLUMN = 110;
const CHAR_EM = 0.58;
// Shrinking a crowded group further than this would break the shared type
// scale; the plan is rejected so the model can simplify it instead.
export const MIN_SCALE = 0.72;

// Story clock, in seconds.
const BEAT = Object.freeze({ hold: 0.9, intro: 0.6, press: 0.16, release: 0.12, rest: 0.7, settle: 1.1, transition: 0.75, travel: 0.7 });

const rectAttrs = (rect) => `x="${formatNumber(rect.x)}" y="${formatNumber(rect.y)}" width="${formatNumber(Math.max(0, rect.width))}" height="${formatNumber(Math.max(0, rect.height))}"`;
const isItem = (node) => typeof node === "string" || node.type === "item";
const itemId = (node) => (typeof node === "string" ? node : node.id);

function labelWidth(element, kind) {
  const chars = Math.min(String(element.label || "").length, 24) || 6;
  return chars * kind.font * CHAR_EM + (element.kind === "text" ? 0 : 24);
}

// Main-axis basis (source px) and whether the item grows to share space.
function naturalSize(element, axis) {
  const kind = KINDS[element.kind];
  if (axis === "y") return kind.height ? { basis: kind.height, grow: false } : { basis: 0, grow: true };
  if (kind.width === "label") return { basis: labelWidth(element, kind), grow: false };
  if (typeof kind.width === "number") return { basis: kind.width, grow: false };
  return { basis: 0, grow: true };
}

// A row or column of natural-size items is itself natural size: it takes
// the space its content needs instead of growing and pushing siblings away.
// Panels are containers and always fill.
function naturalGroup(node, axis, plan, stable = {}) {
  if (isItem(node)) {
    const element = plan.elements[itemId(node)];
    if (!element) return { basis: 0, grow: true };
    const size = naturalSize(element, axis);
    return typeof node === "object" && node.grow ? { basis: 0, grow: true } : size;
  }
  if (node.type === "panel") {
    // A panel hugs natural content vertically; across a row it still shares width.
    if (axis !== "y") return { basis: 0, grow: true };
    const inner = naturalGroup({ children: node.children || [], gap: node.gap, type: node.direction === "row" ? "row" : "column" }, "y", plan, stable);
    if (inner.grow) return inner;
    const kind = KINDS.panel;
    const own = inner.basis + kind.pad * 2 + (plan.elements[node.id]?.label ? kind.header : 0);
    return { basis: Math.max(own, stable[node.id] ?? 0), grow: false };
  }
  const children = (node.children || []).map((child) => naturalGroup(child, axis, plan, stable));
  if (children.length === 0 || children.some((child) => child.grow)) return { basis: 0, grow: true };
  const along = (node.type === "row" ? "x" : "y") === axis;
  const gap = (GAPS[node.gap] ?? GAPS.normal) * Math.max(0, children.length - 1);
  return { basis: along ? children.reduce((total, child) => total + child.basis, 0) + gap : Math.max(...children.map((child) => child.basis)), grow: false };
}

function clampCross(rect, element, axis, k) {
  const kind = KINDS[element.kind];
  if (axis === "y") {
    const width = kind.width === "label" ? labelWidth(element, kind) * k : typeof kind.width === "number" ? kind.width * k : null;
    return width && width < rect.width ? { ...rect, width } : rect;
  }
  const height = kind.height ? kind.height * k : null;
  return height && height < rect.height ? { ...rect, height, y: rect.y + (rect.height - height) / 2 } : rect;
}

/**
 * Solves one state's layout tree inside `rect`. `presence` maps item ids to
 * 0..1 so an entering or leaving item can take part at zero size, which is
 * what makes its neighbours open or close the space around it.
 * @returns { rects, issues } where issues name groups too crowded to fit.
 */
// A panel keeps the tallest size it needs in any state, so a column does not
// shrink and re-center the whole screen when one card leaves it.
function stablePanelHeights(plan) {
  const heights = {};
  const visit = (node) => {
    if (isItem(node)) return;
    if (node.type === "panel") {
      const size = naturalGroup(node, "y", plan);
      if (!size.grow) heights[node.id] = Math.max(heights[node.id] ?? 0, size.basis);
    }
    (node.children || []).forEach(visit);
  };
  plan.states.forEach((state) => visit(state.layout));
  return heights;
}

export function layoutTree(root, rect, plan, frame, presence = {}) {
  const stable = stablePanelHeights(plan);
  const k = sourceUnits(frame)(1);
  const rects = {};
  const issues = [];

  function group(children, axis, area, gapName, path, center = false) {
    if (children.length === 0) return;
    const portraitRow = axis === "x" && area.width / children.length < MIN_COLUMN * k;
    const direction = portraitRow ? "y" : axis;
    const gap = (GAPS[gapName] ?? GAPS.normal) * k;
    const items = children.map((child, index) => {
      if (isItem(child)) {
        const element = plan.elements[itemId(child)];
        const size = naturalSize(element, direction);
        const grow = typeof child === "object" && child.grow ? true : size.grow;
        return { basis: grow ? 0 : size.basis * k, grow: grow ? 1 : 0, id: `__${index}`, presence: presence[itemId(child)] ?? 1 };
      }
      const size = naturalGroup(child, direction, plan, stable);
      return { basis: size.grow ? 0 : size.basis * k, grow: size.grow ? 1 : 0, id: `__${index}`, presence: 1 };
    });
    const length = direction === "x" ? area.width : area.height;
    const needed = items.reduce((total, item) => total + item.basis * item.presence, 0) + gap * Math.max(0, items.length - 1);
    if (needed > length) {
      const scale = Math.max(0, (length - gap * Math.max(0, items.length - 1)) / Math.max(1e-6, needed - gap * Math.max(0, items.length - 1)));
      if (scale < MIN_SCALE) issues.push(path);
      for (const item of items) item.basis *= Math.max(scale, 0);
    }
    // Natural-size items pack from the start like a real list instead of
    // spreading apart; a trailing filler absorbs the free space.
    // The outermost group centers instead, so a compact UI sits mid-frame.
    const lead = { basis: 0, grow: 1, id: "__lead" };
    const fill = { basis: 0, grow: 1, id: "__fill" };
    const packed = items.every((item) => item.grow === 0) ? (center ? [lead, ...items, fill] : [...items, fill]) : items;
    const solved = solve({ axis: direction, children: packed, gap }, area);
    children.forEach((child, index) => node(child, solved[`__${index}`], direction, `${path}/${index}`));
  }

  function node(child, area, parentAxis, path) {
    if (isItem(child)) {
      const id = itemId(child);
      rects[id] = clampCross(area, plan.elements[id], parentAxis, k);
      return;
    }
    if (child.type === "panel") {
      rects[child.id] = area;
      const kind = KINDS.panel;
      const header = plan.elements[child.id]?.label ? kind.header * k : 0;
      const inner = inset(area, kind.pad * k);
      group(child.children || [], child.direction === "row" ? "x" : "y", { ...inner, height: inner.height - header, y: inner.y + header }, child.gap, `${path}:${child.id}`);
      return;
    }
    group(child.children || [], child.type === "row" ? "x" : "y", area, child.gap, path);
  }

  // Rows reflow to a stack only where their columns would get too narrow
  // (see `group`), the way the product would on a phone.
  group([root], "y", rect, "tight", "root", true);
  return { issues, rects };
}

export function idsIn(node) {
  if (isItem(node)) return [itemId(node)];
  return [...(node.type === "panel" ? [node.id] : []), ...(node.children || []).flatMap(idsIn)];
}

// Keyframes on the story clock. Each key records which state the UI shows
// and, at transition endpoints, the neighbouring state, so entering and
// leaving items sit collapsed at their slot. Every key also pins the pointer
// (`aim`), so it moves only between keys that change its aim: travel happens
// while the UI is still, except a drag, which carries its item.
export function planKeys(plan) {
  const keys = [];
  const clicks = [];
  let at = 0;
  let aim = { target: null };
  const push = (step, view, ease) => {
    at += step;
    keys.push({ aim, at: Number(at.toFixed(3)), ease, ...view });
  };
  push(0, { toward: 1, ui: 0 });
  push(BEAT.intro, { toward: 1, ui: 0 });
  const last = plan.states.length - 1;
  for (let index = 0; index < last; index += 1) {
    const { drag = false, target = null } = plan.states[index].pointer || {};
    if (target) {
      aim = { target, ui: index };
      push(BEAT.travel, { toward: index + 1, ui: index });
      push(BEAT.press, { pressed: target, toward: index + 1, ui: index }, "quick");
      clicks.push(at);
      push(BEAT.release, { toward: index + 1, ui: index }, "quick");
      if (drag) aim = { target, ui: index + 1 };
    }
    push(BEAT.transition, { from: index, ui: index + 1 });
    push(index + 1 === last ? BEAT.settle : BEAT.hold, { from: index, ui: index + 1 });
  }
  // Rewind: the pointer walks back to rest while the UI is still, then the
  // UI returns to the opening state so the loop seam is invisible.
  aim = { target: null };
  push(BEAT.travel, { toward: 0, ui: last });
  push(BEAT.transition, { from: last, ui: 0 });
  push(BEAT.rest, { toward: 1, ui: 0 });
  return { clicks, keys };
}

export function planDuration(plan) {
  return planKeys(plan).keys.at(-1).at;
}

function layoutsFor(plan, frame) {
  const solveState = (index, presence) => layoutTree(plan.states[index].layout, frame.safe, plan, frame, presence).rects;
  const present = plan.states.map((state) => new Set(idsIn(state.layout)));
  const base = plan.states.map((_, index) => solveState(index));
  const cache = new Map();
  // The state's layout with items absent from `other` collapsed to zero.
  const collapsed = (index, other) => {
    const key = `${index}:${other}`;
    if (!cache.has(key)) {
      const presence = Object.fromEntries([...present[index]].filter((id) => !present[other].has(id)).map((id) => [id, 0]));
      cache.set(key, Object.keys(presence).length ? solveState(index, presence) : base[index]);
    }
    return cache.get(key);
  };
  return { base, collapsed, present };
}

// Element geometry and opacity at one key.
function viewAt(id, key, layouts, lastSeen) {
  const { base, collapsed, present } = layouts;
  if (present[key.ui].has(id)) return { opacity: 1, rect: base[key.ui][id] };
  // Absent here but present next door: it sits collapsed at that slot, so
  // the transition grows it out of (or shrinks it into) a real position.
  const neighbour = [key.toward, key.from].find((index) => index !== undefined && present[index]?.has(id));
  if (neighbour !== undefined) {
    const rect = collapsed(neighbour, key.ui)[id];
    return { opacity: 0, rect };
  }
  return { opacity: 0, rect: lastSeen };
}

function snapshots(plan, frame, keys) {
  const layouts = layoutsFor(plan, frame);
  const ids = Object.keys(plan.elements);
  const firstRect = (id) => layouts.base.find((rects) => rects[id])?.[id] || { height: 0, width: 0, x: frame.width / 2, y: frame.height / 2 };
  const result = {};
  for (const id of ids) {
    let lastSeen = firstRect(id);
    result[id] = keys.map((key) => {
      const view = viewAt(id, key, layouts, lastSeen);
      lastSeen = view.rect;
      return view;
    });
  }
  return { layouts, views: result };
}

const pressed = (rect, amount) => ({ height: rect.height * amount, width: rect.width * amount, x: rect.x + rect.width * (1 - amount) / 2, y: rect.y + rect.height * (1 - amount) / 2 });

function textFit(label, width, size) {
  const max = Math.max(0, Math.floor(width / (size * CHAR_EM)));
  const text = String(label || "");
  if (text.length <= max) return text;
  return max > 3 ? `${text.slice(0, max - 3).trimEnd()}...` : "";
}

function toneFill(element, index) {
  if (element.tone === "accent") return "var(--accent)";
  if (/^tag-[1-4]$/.test(element.tone || "")) return `var(--${element.tone})`;
  return `var(--tag-${(index % 4) + 1})`;
}

function elementMarkup(id, index, element, views, keys, timeline, k, radius, typography) {
  const frames = views.map((view, key) => (keys[key].pressed === id ? pressed(view.rect, 0.95) : view.rect));
  const opacity = views.map((view) => view.opacity);
  const font = typography?.stack || "ui-sans-serif, system-ui, sans-serif";
  const sized = (offset) => frames.map((rect) => offset(rect));
  const label = element.label ? escapeXml(element.label) : "";
  // Pills size to their label, so they keep only their own inner padding.
  const padding = element.kind === "chip" || element.kind === "button" ? 12 : 28;
  // Labels fit the element at full size and shrink with it while it enters
  // or leaves, so collapsing items never stack readable text on each other.
  const full = { height: Math.max(...frames.map((rect) => rect.height)), width: Math.max(...frames.map((rect) => rect.width)) };
  const growth = frames.map((rect) => Math.max(0, Math.min(1, rect.height / Math.max(full.height, 1e-6), rect.width / Math.max(full.width, 1e-6))));
  const text = (size, place, attributes) => {
    if (!label) return "";
    const anchors = sized(place);
    const fitted = escapeXml(textFit(element.label, full.width - (element.kind === "text" ? 0 : padding * k), size * k));
    if (!fitted) return "";
    return timeline.element("text", { "font-size": growth.map((scale) => size * k * scale), x: anchors.map((point) => point.x), y: anchors.map((point) => point.y) }, `font-family="${escapeXml(font)}" ${attributes}`, fitted);
  };
  const rr = (rect) => Math.min(radius, rect.height / 2);
  const kind = KINDS[element.kind];
  let body = "";
  switch (element.kind) {
    case "panel":
      body = `${timeline.element("rect", rectTracks(frames), `rx="${formatNumber(radius)}" class="ln-hair" fill="var(--surface)" stroke="var(--border)"`)}
        ${text(kind.font, (rect) => ({ x: rect.x + kind.pad * k, y: rect.y + kind.pad * k + kind.font * k * 0.9 }), `font-weight="600" fill="var(--ink)" fill-opacity=".62"`)}`;
      break;
    case "card":
      body = `${timeline.element("rect", rectTracks(frames), `rx="${formatNumber(rr(frames[0]))}" class="ln-hair" fill="var(--surface)" stroke="var(--border)"`)}
        ${label ? text(kind.font, (rect) => ({ x: rect.x + 14 * k, y: rect.y + 14 * k + kind.font * k * 0.85 }), `font-weight="600" fill="var(--ink)" fill-opacity=".85"`)
          : timeline.element("rect", rectTracks(sized((rect) => ({ height: 7 * k, width: rect.width * 0.5, x: rect.x + 14 * k, y: rect.y + 16 * k }))), `rx="${formatNumber(3.5 * k)}" fill="var(--ink)" opacity=".2"`)}
        ${timeline.element("rect", rectTracks(sized((rect) => ({ height: 6 * k, width: rect.width * 0.62, x: rect.x + 14 * k, y: rect.y + rect.height - 26 * k }))), `class="lod-fine" rx="${formatNumber(3 * k)}" fill="var(--ink)" opacity=".1"`)}
        ${timeline.element("circle", { cx: sized((rect) => rect.x + rect.width - 22 * k), cy: sized((rect) => rect.y + rect.height - 22 * k), r: sized(() => 8 * k) }, `fill="${toneFill(element, index)}"`)}`;
      break;
    case "row":
      body = `${timeline.element("rect", rectTracks(frames), `rx="${formatNumber(rr(frames[0]))}" fill="var(--surface)" class="ln-hair" stroke="var(--border)"`)}
        ${timeline.element("circle", { cx: sized((rect) => rect.x + 22 * k), cy: sized((rect) => rect.y + rect.height / 2), r: sized((rect) => Math.min(10 * k, rect.height / 3)) }, `fill="${toneFill(element, index)}"`)}
        ${label ? text(kind.font, (rect) => ({ x: rect.x + 42 * k, y: rect.y + rect.height / 2 + kind.font * k * 0.35 }), `fill="var(--ink)" fill-opacity=".82"`)
          : timeline.element("rect", rectTracks(sized((rect) => ({ height: 7 * k, width: Math.max(0, rect.width * 0.45), x: rect.x + 42 * k, y: rect.y + rect.height / 2 - 3.5 * k }))), `rx="${formatNumber(3.5 * k)}" fill="var(--ink)" opacity=".2"`)}`;
      break;
    case "chip": {
      // An accent chip is a soft tint with accent text; solid accent is
      // reserved for buttons, so the call to action stays unique.
      const accent = element.tone === "accent";
      body = `${timeline.element("rect", { ...rectTracks(frames), rx: sized((rect) => rect.height / 2) }, `fill="${accent ? "var(--accent-soft)" : toneFill(element, index)}"${accent ? ` class="ln-hair" stroke="var(--accent)" stroke-opacity=".45"` : ""}`)}
        ${text(kind.font, (rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 + kind.font * k * 0.35 }), `text-anchor="middle" font-weight="600" ${accent ? `fill="var(--accent)"` : `fill="var(--ink)" fill-opacity=".8"`}`)}`;
      break;
    }
    case "button":
      body = `${timeline.element("rect", { ...rectTracks(frames), rx: sized((rect) => Math.min(radius, rect.height / 2)) }, `fill="var(--accent)"`)}
        ${text(kind.font, (rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 + kind.font * k * 0.35 }), `text-anchor="middle" font-weight="600" fill="#fff"`)}`;
      break;
    case "field":
      body = `${timeline.element("rect", rectTracks(frames), `rx="${formatNumber(rr(frames[0]))}" fill="var(--muted)" class="ln-hair" stroke="var(--border)"`)}
        ${text(kind.font, (rect) => ({ x: rect.x + 12 * k, y: rect.y + rect.height / 2 + kind.font * k * 0.35 }), `fill="var(--ink)" fill-opacity=".5"`)}`;
      break;
    case "avatar":
      body = timeline.element("circle", { cx: sized((rect) => rect.x + rect.width / 2), cy: sized((rect) => rect.y + rect.height / 2), r: sized((rect) => Math.min(rect.width, rect.height) / 2) }, `fill="${toneFill(element, index)}"`);
      break;
    case "text":
      body = text(kind.font, (rect) => ({ x: rect.x, y: rect.y + rect.height * 0.75 }), `font-weight="650" fill="var(--ink)" letter-spacing="-.02em"`);
      break;
    case "chart":
      body = `${timeline.element("rect", rectTracks(frames), `rx="${formatNumber(rr(frames[0]))}" class="ln-hair" fill="var(--surface)" stroke="var(--border)"`)}
        ${[0.42, 0.66, 0.5, 0.82, 0.6, 0.92].map((height, bar) => timeline.element("rect", rectTracks(sized((rect) => {
          const innerWidth = rect.width - 28 * k;
          const pitch = innerWidth / 6;
          const h = (rect.height - 28 * k) * height;
          return { height: h, width: pitch * 0.56, x: rect.x + 14 * k + pitch * bar + pitch * 0.22, y: rect.y + rect.height - 14 * k - h };
        })), `rx="${formatNumber(3 * k)}" fill="${bar === 5 ? "var(--accent)" : "var(--tag-1)"}"`)).join("")}`;
      break;
    default:
      body = timeline.element("rect", rectTracks(frames), `rx="${formatNumber(3 * k)}" fill="var(--ink)" opacity=".15"`);
  }
  return `<g data-plan-id="${escapeXml(id)}" opacity="${formatNumber(opacity[0])}">${timeline.animate("opacity", opacity)}${body}</g>`;
}

// A ring drawn over the element: a tinted cover would grey out its label.
function highlightMarkup(plan, id, views, keys, timeline, radius) {
  const on = keys.map((key, index) => ((plan.states[key.ui].highlight || []).includes(id) && views[index].opacity > 0 ? 1 : 0));
  if (on.every((value) => value === 0)) return "";
  const frames = views.map((view) => view.rect);
  return `<g opacity="${on[0]}">${timeline.animate("opacity", on)}${timeline.element("rect", rectTracks(frames), `rx="${formatNumber(Math.min(radius, frames[0].height / 2))}" fill="none" class="ln-base" stroke="var(--accent)"`)}</g>`;
}

// Containers draw first so items always sit on top of the panel they are in.
function paintOrder(plan) {
  const panels = new Set(plan.states.flatMap((state) => idsIn(state.layout).filter((id) => plan.elements[id]?.kind === "panel")));
  const ids = Object.keys(plan.elements);
  return [...ids.filter((id) => panels.has(id)), ...ids.filter((id) => !panels.has(id))];
}

export function composePlan(scene) {
  const plan = scene.story.plan;
  const frame = frameFor(scene.format);
  const k = sourceUnits(frame)(1);
  const radius = Math.max(0, (scene.palette.radius ?? 0) / frame.unitPx);
  const { clicks, keys } = planKeys(plan);
  const timeline = createTimeline(keys, scene.duration);
  const { layouts, views } = snapshots(plan, frame, keys);
  const used = new Set(plan.states.flatMap((state) => idsIn(state.layout)));
  const order = paintOrder(plan).filter((id) => used.has(id));
  const elements = order.map((id) => {
    const index = Object.keys(plan.elements).indexOf(id);
    return `${elementMarkup(id, index, plan.elements[id], views[id], keys, timeline, k, radius, scene.typography)}${highlightMarkup(plan, id, views[id], keys, timeline, radius)}`;
  }).join("\n    ");

  // The pointer rests just off the opening screen's lower right corner.
  const opening = Object.values(layouts.base[0]);
  const right = Math.max(...opening.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...opening.map((rect) => rect.y + rect.height));
  const rest = {
    x: Math.min(frame.safe.x + frame.safe.width - 20 * k, right - 30 * k),
    y: Math.min(frame.safe.y + frame.safe.height - 20 * k, bottom + 18 * k),
  };
  const pointAt = ({ target, ui }) => {
    const rect = target ? layouts.base[ui][target] : null;
    return rect ? { x: rect.x + rect.width * 0.55, y: rect.y + rect.height * 0.55 } : rest;
  };
  const pointerMarkup = keys.some((key) => key.aim.target)
    ? cursor({ ...scene, timing: storyClock(keys) }, keys.map((key) => {
      const { x, y } = pointAt(key.aim);
      return { at: key.at, x: formatNumber(x), y: formatNumber(y) };
    }), clicks)
    : "";

  return {
    content: `
    ${layoutMetadata(scene.format, { root: frame.safe })}
    ${backdrop(scene, frame)}
    ${elements}
    ${pointerMarkup}`,
    model: { frame, keys, regions: { root: frame.safe } },
    referenceWidth: frame.referenceWidth,
    viewBox: { height: frame.height, width: frame.width },
  };
}

export const __testing = { BEAT, viewAt };

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
  image: { height: 92 },
  panel: { font: 12, header: 22, pad: 14 },
  row: { font: 12, height: 46 },
  text: { font: 17, height: 24, width: "label" },
  toggle: { height: 22, width: 40 },
  trend: { height: 116 },
});
const GAPS = Object.freeze({ loose: 22, normal: 12, tight: 6 });
const MIN_COLUMN = 110;
const CHAR_EM = 0.58;
// Shrinking a crowded group further than this would break the shared type
// scale; the plan is rejected so the model can simplify it instead.
export const MIN_SCALE = 0.72;

// Story clock, in seconds.
const BEAT = Object.freeze({ dwell: 0.35, hold: 0.9, intro: 0.6, press: 0.16, release: 0.14, rest: 0.7, revert: 0.45, settle: 1.1, transition: 0.75, travel: 0.7 });

const rectAttrs = (rect) => `x="${formatNumber(rect.x)}" y="${formatNumber(rect.y)}" width="${formatNumber(Math.max(0, rect.width))}" height="${formatNumber(Math.max(0, rect.height))}"`;
const isItem = (node) => typeof node === "string" || node.type === "item";
const itemId = (node) => (typeof node === "string" ? node : node.id);

function labelWidth(element, kind) {
  // Unlabeled text is a heading-sized skeleton bar, wider than a word.
  const chars = Math.min(String(element.label || "").length, 24) || (element.kind === "text" ? 9 : 6);
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

export function layoutTree(root, rect, plan, frame, presence = {}, { minScale = MIN_SCALE } = {}) {
  const stable = stablePanelHeights(plan);
  const k = sourceUnits(frame)(1);
  const rects = {};
  const issues = [];

  function group(children, axis, area, gapName, path, center = false) {
    if (children.length === 0) return;
    const gap = (GAPS[gapName] ?? GAPS.normal) * k;
    // Natural-size items (chips, buttons) that fit side by side stay a row
    // however narrow each column would be; only stretchy content reflows.
    const across = children.map((child) => naturalGroup(child, "x", plan, stable));
    const fitsAcross = across.every((size) => !size.grow) && across.reduce((total, size) => total + size.basis * k, 0) + gap * (children.length - 1) <= area.width;
    const portraitRow = axis === "x" && area.width / children.length < MIN_COLUMN * k && !fitsAcross;
    const direction = portraitRow ? "y" : axis;
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
      if (scale < minScale - 1e-6) issues.push(path);
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
// while the UI is still, except a drag, which carries its item. A key may
// show element statuses from another state (`status`), which lets the
// rewind clear results before the layout folds back.
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
    const { drag = false, hover = false, target = null } = plan.states[index].pointer || {};
    if (target) {
      aim = { target, ui: index };
      push(BEAT.travel, { toward: index + 1, ui: index });
      if (hover) {
        push(BEAT.dwell, { toward: index + 1, ui: index });
      } else {
        push(BEAT.press, { pressed: target, scale: 0.94, toward: index + 1, ui: index }, "quick");
        clicks.push(at);
        // A small overshoot on release, settled by the transition that follows.
        push(BEAT.release, { pressed: target, scale: 1.02, toward: index + 1, ui: index }, "quick");
        if (drag) aim = { target, ui: index + 1 };
      }
    }
    push(BEAT.transition, { from: index, ui: index + 1 });
    push(index + 1 === last ? BEAT.settle : BEAT.hold, { from: index, ui: index + 1 });
  }
  // Rewind: the pointer walks back to rest while the UI is still, results
  // clear, then the layout returns to the opening state so the loop seam is
  // invisible.
  aim = { target: null };
  push(BEAT.travel, { toward: 0, ui: last });
  const statusOf = (state) => JSON.stringify([state.status || {}, state.value || {}, state.links || []]);
  if (statusOf(plan.states[last]) !== statusOf(plan.states[0])) push(BEAT.revert, { status: 0, toward: 0, ui: last });
  push(BEAT.transition, { from: last, ui: 0 });
  push(BEAT.rest, { toward: 1, ui: 0 });
  return { clicks, keys };
}

export function planDuration(plan) {
  return planKeys(plan).keys.at(-1).at;
}

// Lists read as real product screens when they are full. A panel holding a
// column of rows or cards gets unlabeled skeleton siblings, as many as the
// frame leaves room for without shrinking anything, the same count in every
// state so an insert never overflows. Fillers carry no meaning and are never
// targeted, highlighted, or linked.
const FILLABLE = new Set(["card", "row"]);
const MAX_FILLERS = 5;
const FILL_ROOM = 0.92;

function fillablePanels(plan) {
  const kinds = {};
  const rejected = new Set();
  const visit = (node) => {
    if (isItem(node)) return;
    if (node.type === "panel") {
      const items = node.children.filter(isItem).map((child) => plan.elements[itemId(child)]?.kind);
      if (node.direction === "row" || items.length !== node.children.length || items.some((kind) => !FILLABLE.has(kind))) rejected.add(node.id);
      else if (items.length) kinds[node.id] ??= items[0];
    }
    node.children.forEach(visit);
  };
  plan.states.forEach((state) => visit(state.layout));
  return Object.entries(kinds).filter(([id]) => !rejected.has(id));
}

function addFillers(plan, counts, kinds) {
  if (Object.values(counts).every((count) => count === 0)) return plan;
  const elements = { ...plan.elements };
  const fillerIds = {};
  for (const [panel, count] of Object.entries(counts)) {
    fillerIds[panel] = Array.from({ length: count }, (_, index) => `__fill-${panel}-${index}`);
    for (const id of fillerIds[panel]) elements[id] = { filler: true, kind: kinds[panel] };
  }
  const withIds = (node) => {
    if (isItem(node)) return node;
    const children = node.children.map(withIds);
    return { ...node, children: node.type === "panel" && fillerIds[node.id] ? [...children, ...fillerIds[node.id]] : children };
  };
  return { ...plan, elements, states: plan.states.map((state) => ({ ...state, layout: withIds(state.layout) })) };
}

export function withFillers(plan, frame) {
  const candidates = fillablePanels(plan);
  if (candidates.length === 0) return plan;
  const kinds = Object.fromEntries(candidates);
  const room = { ...frame.safe, height: frame.safe.height * FILL_ROOM, y: frame.safe.y + frame.safe.height * (1 - FILL_ROOM) / 2 };
  const fits = (trial) => trial.states.every((state) => layoutTree(state.layout, room, trial, frame, {}, { minScale: 1 }).issues.length === 0);
  if (!fits(plan)) return plan;
  const counts = Object.fromEntries(candidates.map(([id]) => [id, 0]));
  const open = new Set(Object.keys(counts));
  while (open.size) {
    // Grow the emptiest panel first so side-by-side columns stay balanced.
    const panel = [...open].sort((a, b) => counts[a] - counts[b])[0];
    const next = { ...counts, [panel]: counts[panel] + 1 };
    if (next[panel] > MAX_FILLERS || !fits(addFillers(plan, next, kinds))) open.delete(panel);
    else Object.assign(counts, next);
  }
  return addFillers(plan, counts, kinds);
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
  return { base, collapsed, origins: plan.states.map((state) => state.origin || {}), present };
}

// Element geometry and opacity at one key.
function viewAt(id, key, layouts, lastSeen) {
  const { base, collapsed, origins, present } = layouts;
  if (present[key.ui].has(id)) return { opacity: 1, rect: base[key.ui][id] };
  // Absent here but present next door: it sits collapsed at that slot, so
  // the transition grows it out of (or shrinks it into) a real position.
  // An insert with an origin starts as that element's shape instead.
  const neighbour = [key.toward, key.from].find((index) => index !== undefined && present[index]?.has(id));
  if (neighbour !== undefined) {
    const source = neighbour === key.toward ? origins[neighbour][id] : undefined;
    if (source && base[key.ui][source]) return { opacity: 0, rect: base[key.ui][source] };
    return { opacity: 0, rect: collapsed(neighbour, key.ui)[id] };
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

// `surface` is a pill's background, which stays a tint so its label reads;
// "mark" is a dot or avatar, which shows the brand hue itself.
function toneFill(element, index, use = "surface") {
  const scale = use === "mark" ? "mark" : "tag";
  if (element.tone === "accent") return "var(--accent)";
  if (element.tone === "neutral") return use === "mark" ? "color-mix(in oklab, var(--ink) 24%, var(--surface))" : "var(--muted)";
  const tag = /^tag-([1-4])$/.exec(element.tone || "");
  return `var(--${scale}-${tag ? tag[1] : (index % 4) + 1})`;
}

// Pressed elements shrink slightly; anything drawn around an element must use
// these frames, or it stays full size and opens a gap during the click.
const elementFrames = (id, views, keys) => views.map((view, key) => (keys[key].pressed === id ? pressed(view.rect, keys[key].scale ?? 0.95) : view.rect));

// Corner radius per frame, shared by an element's body and its highlight
// ring so the ring always traces the shape. Taken per frame rather than from
// the first, where an element that enters later has zero size.
function cornerTrack(element, frames, radius, k) {
  return frames.map((rect) => {
    if (element.kind === "chip" || element.kind === "toggle") return rect.height / 2;
    if (element.kind === "avatar") return Math.min(rect.width, rect.height) / 2;
    if (element.kind === "bar") return 3 * k;
    if (element.kind === "panel") return radius;
    return Math.min(radius, rect.height / 2);
  });
}

const CHECK = (cx, cy, size) => `M${formatNumber(cx - size * 0.45)} ${formatNumber(cy)} L${formatNumber(cx - size * 0.12)} ${formatNumber(cy + size * 0.32)} L${formatNumber(cx + size * 0.48)} ${formatNumber(cy - size * 0.36)}`;
const TREND = [0.72, 0.58, 0.64, 0.44, 0.5, 0.3, 0.22];

function trendPoints(rect, k) {
  const inner = inset(rect, 16 * k);
  return TREND.map((level, index) => ({ x: inner.x + (inner.width * index) / (TREND.length - 1), y: inner.y + inner.height * level }));
}

function pointAlong(points, fraction) {
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  let left = lengths.reduce((total, length) => total + length, 0) * fraction;
  for (let index = 0; index < lengths.length; index += 1) {
    if (left <= lengths[index] || index === lengths.length - 1) {
      const t = lengths[index] ? Math.min(1, left / lengths[index]) : 0;
      return { x: points[index].x + (points[index + 1].x - points[index].x) * t, y: points[index].y + (points[index + 1].y - points[index].y) * t };
    }
    left -= lengths[index];
  }
  return points.at(-1);
}

/**
 * Status layers drawn over an element: each is a static shape whose opacity
 * follows the element's status at every key, so a state change crossfades
 * during the transition that causes it.
 */
function statusMarkup(element, frames, rx, statuses, timeline, k) {
  const has = (name) => statuses.includes(name);
  const is = (name) => statuses.map((status) => (status === name ? 1 : 0));
  const layer = (name, tag, tracks, attributes) => (has(name) ? `<g opacity="${is(name)[0]}">${timeline.animate("opacity", is(name))}${timeline.element(tag, tracks, attributes)}</g>` : "");
  const rect = { ...rectTracks(frames), rx };
  const out = [];
  const tint = !["avatar", "text", "toggle", "trend", "chart", "bar"].includes(element.kind);
  if (tint) {
    out.push(layer("selected", "rect", rect, `fill="var(--accent)" fill-opacity=".08" class="ln-base" stroke="var(--accent)" stroke-opacity=".55"`));
    out.push(layer("pending", "rect", rect, `fill="var(--accent-soft)" fill-opacity=".7" class="ln-base" stroke="var(--accent)" stroke-dasharray="${formatNumber(6 * k)} ${formatNumber(5 * k)}"`));
    if (element.kind !== "button") out.push(layer("on", "rect", rect, `fill="var(--accent)" fill-opacity=".12" class="ln-base" stroke="var(--accent)" stroke-opacity=".7"`));
  }
  if (["field", "card", "row", "panel", "image"].includes(element.kind)) {
    const ring = frames.map((frame) => ({ height: frame.height + 6 * k, width: frame.width + 6 * k, x: frame.x - 3 * k, y: frame.y - 3 * k }));
    out.push(layer("focused", "rect", { ...rectTracks(ring), rx: rx.map((value) => value + 3 * k) }, `fill="none" class="ln-base" stroke="var(--accent)"`));
  }
  if (has("done")) {
    const badge = element.kind === "button"
      ? frames.map((frame) => ({ cx: frame.x + frame.width / 2, cy: frame.y + frame.height / 2, r: 0 }))
      : frames.map((frame) => {
        if (element.kind === "avatar") return { cx: frame.x + frame.width * 0.85, cy: frame.y + frame.height * 0.85, r: Math.min(frame.width, frame.height) * 0.22 };
        if (element.kind === "card") return { cx: frame.x + frame.width - 22 * k, cy: frame.y + frame.height - 22 * k, r: 9 * k };
        if (element.kind === "chip") return { cx: frame.x + frame.height / 2, cy: frame.y + frame.height / 2, r: frame.height * 0.32 };
        return { cx: frame.x + frame.width - 20 * k, cy: frame.y + frame.height / 2, r: Math.min(9 * k, frame.height / 3) };
      });
    const size = element.kind === "button" ? 14 * k : badge[0].r * 1.3;
    const check = badge.map((spot) => CHECK(spot.cx, spot.cy, element.kind === "button" ? size : spot.r * 1.3));
    const done = is("done");
    out.push(`<g opacity="${done[0]}">${timeline.animate("opacity", done)}${element.kind === "button" ? "" : timeline.element("circle", { cx: badge.map((spot) => spot.cx), cy: badge.map((spot) => spot.cy), r: badge.map((spot) => spot.r) }, `fill="var(--accent)"`)}<path d="${check[0]}" fill="none" stroke="#fff" stroke-width="${formatNumber(Math.max(1.5 * k, size * 0.16))}" stroke-linecap="round" stroke-linejoin="round">${timeline.animateText("d", check)}</path></g>`);
  }
  return out.join("");
}

function elementMarkup(id, index, element, views, keys, timeline, k, radius, typography, stateAt) {
  const frames = elementFrames(id, views, keys);
  const rx = cornerTrack(element, frames, radius, k);
  const statuses = keys.map((key) => stateAt(key).status?.[id] ?? element.state ?? "idle");
  const values = keys.map((key) => stateAt(key).value?.[id] ?? element.value ?? null);
  const valued = values.some((value) => value !== null);
  const valueAt = (fallback) => values.map((value) => (value === null ? fallback : value));
  // Dimmed items stay in place at low opacity, the way a filter leaves its
  // non-matching rows visible behind the result.
  const opacity = views.map((view, key) => view.opacity * (statuses[key] === "dim" ? 0.32 : 1));
  const font = typography?.stack || "ui-sans-serif, system-ui, sans-serif";
  const sized = (offset) => frames.map((rect) => offset(rect));
  const label = element.label ? escapeXml(element.label) : "";
  const done = statuses.map((status) => (status === "done" ? 1 : 0));
  const hideOnDone = element.kind === "button" && done.some(Boolean) ? (markup) => `<g opacity="${1 - done[0]}">${timeline.animate("opacity", done.map((value) => 1 - value))}${markup}</g>` : (markup) => markup;
  // Pills size to their label, so they keep only their own inner padding.
  const padding = element.kind === "chip" || element.kind === "button" ? 12 : 28;
  // Labels fit the element at full size and shrink with it while it enters
  // or leaves, so collapsing items never stack readable text on each other.
  const full = { height: Math.max(...frames.map((rect) => rect.height)), width: Math.max(...frames.map((rect) => rect.width)) };
  const growth = frames.map((rect) => Math.max(0, Math.min(1, rect.height / Math.max(full.height, 1e-6), rect.width / Math.max(full.width, 1e-6))));
  // A row with a value keeps its label clear of the progress strip on its right.
  const room = valued && element.kind === "row" ? full.width * 0.55 - 50 * k : full.width - (element.kind === "text" ? 0 : padding * k);
  const text = (size, place, attributes) => {
    if (!label) return "";
    const anchors = sized(place);
    const fitted = escapeXml(textFit(element.label, room, size * k));
    if (!fitted) return "";
    return timeline.element("text", { "font-size": growth.map((scale) => size * k * scale), x: anchors.map((point) => point.x), y: anchors.map((point) => point.y) }, `font-family="${escapeXml(font)}" ${attributes}`, fitted);
  };
  // Unlabeled pills and headings draw a skeleton bar where the words would be.
  const skeleton = (box, attributes) => timeline.element("rect", rectTracks(sized(box)), attributes);
  const kind = KINDS[element.kind];
  let body = "";
  switch (element.kind) {
    case "panel":
      body = `${timeline.element("rect", rectTracks(frames), `rx="${formatNumber(radius)}" class="ln-hair" fill="var(--surface)" stroke="var(--border)"`)}
        ${text(kind.font, (rect) => ({ x: rect.x + kind.pad * k, y: rect.y + kind.pad * k + kind.font * k * 0.9 }), `font-weight="600" fill="var(--ink)" fill-opacity=".62"`)}`;
      break;
    case "card":
      body = `${timeline.element("rect", { ...rectTracks(frames), rx }, `class="ln-hair" fill="var(--surface)" stroke="var(--border)"`)}
        ${label ? text(kind.font, (rect) => ({ x: rect.x + 14 * k, y: rect.y + 14 * k + kind.font * k * 0.85 }), `font-weight="600" fill="var(--ink)" fill-opacity=".85"`)
          : timeline.element("rect", rectTracks(sized((rect) => ({ height: 7 * k, width: rect.width * 0.5, x: rect.x + 14 * k, y: rect.y + 16 * k }))), `rx="${formatNumber(3.5 * k)}" fill="var(--ink)" opacity=".2"`)}
        ${valued ? "" : timeline.element("rect", rectTracks(sized((rect) => ({ height: 6 * k, width: rect.width * 0.62, x: rect.x + 14 * k, y: rect.y + rect.height - 26 * k }))), `class="lod-fine" rx="${formatNumber(3 * k)}" fill="var(--ink)" opacity=".1"`)}
        ${timeline.element("circle", { cx: sized((rect) => rect.x + rect.width - 22 * k), cy: sized((rect) => rect.y + rect.height - 22 * k), r: sized(() => 8 * k) }, `fill="${toneFill(element, index, "mark")}"`)}`;
      break;
    case "row":
      body = `${timeline.element("rect", { ...rectTracks(frames), rx }, `fill="var(--surface)" class="ln-hair" stroke="var(--border)"`)}
        ${timeline.element("circle", { cx: sized((rect) => rect.x + 22 * k), cy: sized((rect) => rect.y + rect.height / 2), r: sized((rect) => Math.min(10 * k, rect.height / 3)) }, `fill="${toneFill(element, index, "mark")}"`)}
        ${label ? text(kind.font, (rect) => ({ x: rect.x + 42 * k, y: rect.y + rect.height / 2 + kind.font * k * 0.35 }), `fill="var(--ink)" fill-opacity=".82"`)
          : timeline.element("rect", rectTracks(sized((rect) => ({ height: 7 * k, width: Math.max(0, rect.width * 0.45), x: rect.x + 42 * k, y: rect.y + rect.height / 2 - 3.5 * k }))), `rx="${formatNumber(3.5 * k)}" fill="var(--ink)" opacity=".2"`)}`;
      break;
    case "chip": {
      // An accent chip is a soft tint with accent text; solid accent is
      // reserved for buttons, so the call to action stays unique.
      const accent = element.tone === "accent";
      body = `${timeline.element("rect", { ...rectTracks(frames), rx }, `fill="${accent ? "var(--accent-soft)" : toneFill(element, index)}"${accent ? ` class="ln-hair" stroke="var(--accent)" stroke-opacity=".45"` : ""}`)}
        ${label ? text(kind.font, (rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 + kind.font * k * 0.35 }), `text-anchor="middle" font-weight="600" ${accent ? `fill="var(--accent)"` : `fill="var(--ink)" fill-opacity=".8"`}`)
          : skeleton((rect) => ({ height: 6 * k, width: rect.width * 0.5, x: rect.x + rect.width * 0.25, y: rect.y + rect.height / 2 - 3 * k }), `rx="${formatNumber(3 * k)}" fill="${accent ? "var(--accent)" : "var(--ink)"}" opacity=".35"`)}`;
      break;
    }
    case "button":
      body = `${timeline.element("rect", { ...rectTracks(frames), rx }, `fill="var(--accent)"`)}
        ${hideOnDone(label ? text(kind.font, (rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 + kind.font * k * 0.35 }), `text-anchor="middle" font-weight="600" fill="#fff"`)
          : skeleton((rect) => ({ height: 7 * k, width: Math.min(rect.width * 0.55, 60 * k), x: rect.x + rect.width / 2 - Math.min(rect.width * 0.55, 60 * k) / 2, y: rect.y + rect.height / 2 - 3.5 * k }), `rx="${formatNumber(3.5 * k)}" fill="#fff" opacity=".8"`))}`;
      break;
    case "field": {
      const typed = valueAt(0);
      const typing = valued || statuses.includes("focused");
      const placeholder = typed.map((value) => Math.max(0, 1 - value * 5));
      const caret = statuses.map((status) => (status === "focused" ? 1 : 0));
      const barWidth = frames.map((rect, key) => Math.max(0, (rect.width - 36 * k) * typed[key]));
      body = `${timeline.element("rect", { ...rectTracks(frames), rx }, `fill="var(--muted)" class="ln-hair" stroke="var(--border)"`)}
        ${label ? `<g opacity="${formatNumber(placeholder[0])}">${timeline.animate("opacity", placeholder)}${text(kind.font, (rect) => ({ x: rect.x + 12 * k, y: rect.y + rect.height / 2 + kind.font * k * 0.35 }), `fill="var(--ink)" fill-opacity=".5"`)}</g>` : ""}
        ${typing ? `${timeline.element("rect", { height: frames.map(() => 7 * k), width: barWidth, x: frames.map((rect) => rect.x + 12 * k), y: frames.map((rect) => rect.y + rect.height / 2 - 3.5 * k) }, `rx="${formatNumber(3.5 * k)}" fill="var(--ink)" opacity=".55"`)}
        <g opacity="${caret[0]}">${timeline.animate("opacity", caret)}${timeline.element("rect", { height: frames.map((rect) => Math.min(16 * k, rect.height * 0.5)), width: frames.map(() => 1.6 * k), x: frames.map((rect, key) => rect.x + 14 * k + barWidth[key]), y: frames.map((rect) => rect.y + rect.height / 2 - Math.min(8 * k, rect.height * 0.25)) }, `fill="var(--accent)"`)}</g>` : ""}`;
      break;
    }
    case "avatar":
      body = timeline.element("circle", { cx: sized((rect) => rect.x + rect.width / 2), cy: sized((rect) => rect.y + rect.height / 2), r: sized((rect) => Math.min(rect.width, rect.height) / 2) }, `fill="${toneFill(element, index, "mark")}"`);
      break;
    case "text":
      body = label ? text(kind.font, (rect) => ({ x: rect.x, y: rect.y + rect.height * 0.75 }), `font-weight="650" fill="var(--ink)" letter-spacing="-.02em"`)
        : skeleton((rect) => ({ height: Math.min(12 * k, rect.height * 0.5), width: rect.width, x: rect.x, y: rect.y + rect.height / 2 - Math.min(6 * k, rect.height * 0.25) }), `rx="${formatNumber(6 * k)}" fill="var(--ink)" opacity=".7"`);
      break;
    case "chart": {
      const level = valueAt(0.7);
      body = `${timeline.element("rect", { ...rectTracks(frames), rx }, `class="ln-hair" fill="var(--surface)" stroke="var(--border)"`)}
        ${[0.42, 0.66, 0.5, 0.82, 0.6, 0.92].map((height, bar) => timeline.element("rect", rectTracks(frames.map((rect, key) => {
          const innerWidth = rect.width - 28 * k;
          const pitch = innerWidth / 6;
          // A value change grows the bars, the newest one most.
          const scale = bar === 5 ? 0.25 + 0.75 * level[key] : 0.55 + 0.45 * level[key];
          const h = (rect.height - 28 * k) * height * scale;
          return { height: h, width: pitch * 0.56, x: rect.x + 14 * k + pitch * bar + pitch * 0.22, y: rect.y + rect.height - 14 * k - h };
        })), `rx="${formatNumber(3 * k)}" fill="${bar === 5 ? "var(--accent)" : "var(--tag-1)"}"`)).join("")}`;
      break;
    }
    case "trend": {
      // The line inks up to the value with a marker on its tip, so a value
      // change reads as the metric moving.
      const ink = valueAt(1);
      const paths = frames.map((rect) => trendPoints(rect, k).map((point, at) => `${at ? "L" : "M"}${formatNumber(point.x)} ${formatNumber(point.y)}`).join(" "));
      const tips = frames.map((rect, key) => pointAlong(trendPoints(rect, k), ink[key]));
      body = `${timeline.element("rect", { ...rectTracks(frames), rx }, `class="ln-hair" fill="var(--surface)" stroke="var(--border)"`)}
        <path d="${paths[0]}" fill="none" class="ln-base" stroke="var(--border-strong)">${timeline.animateText("d", paths)}</path>
        ${timeline.element("path", { "stroke-dashoffset": ink.map((value) => 1 - value) }, `d="${paths[0]}" pathLength="1" stroke-dasharray="1 1" fill="none" class="ln-strong" stroke="var(--accent)" stroke-linecap="round"`, timeline.animateText("d", paths))}
        ${timeline.element("circle", { cx: tips.map((tip) => tip.x), cy: tips.map((tip) => tip.y), r: frames.map(() => 5 * k) }, `fill="var(--accent)" stroke="var(--surface)" class="ln-base"`)}`;
      break;
    }
    case "toggle": {
      const on = statuses.map((status) => (status === "on" || status === "done" ? 1 : 0));
      body = `${timeline.element("rect", { ...rectTracks(frames), rx }, `fill="var(--muted)" class="ln-hair" stroke="var(--border-strong)"`)}
        <g opacity="${on[0]}">${timeline.animate("opacity", on)}${timeline.element("rect", { ...rectTracks(frames), rx }, `fill="var(--accent)"`)}</g>
        ${timeline.element("circle", { cx: frames.map((rect, key) => rect.x + rect.height / 2 + (rect.width - rect.height) * on[key]), cy: sized((rect) => rect.y + rect.height / 2), r: sized((rect) => rect.height / 2 - 3 * k) }, `fill="var(--surface)"`)}`;
      break;
    }
    case "image":
      body = `${timeline.element("rect", { ...rectTracks(frames), rx }, `fill="${toneFill(element, index)}"`)}
        ${timeline.element("circle", { cx: sized((rect) => rect.x + rect.width * 0.7), cy: sized((rect) => rect.y + rect.height * 0.32), r: sized((rect) => Math.min(rect.width, rect.height) * 0.09) }, `fill="var(--surface)" opacity=".75"`)}
        <path d="${(() => { const rect = frames[0]; return `M${formatNumber(rect.x)} ${formatNumber(rect.y + rect.height * 0.86)} L${formatNumber(rect.x + rect.width * 0.32)} ${formatNumber(rect.y + rect.height * 0.5)} L${formatNumber(rect.x + rect.width * 0.55)} ${formatNumber(rect.y + rect.height * 0.74)} L${formatNumber(rect.x + rect.width)} ${formatNumber(rect.y + rect.height * 0.42)}`; })()}" fill="none" class="ln-strong" stroke="var(--surface)" stroke-opacity=".75" stroke-linejoin="round">${timeline.animateText("d", frames.map((rect) => `M${formatNumber(rect.x)} ${formatNumber(rect.y + rect.height * 0.86)} L${formatNumber(rect.x + rect.width * 0.32)} ${formatNumber(rect.y + rect.height * 0.5)} L${formatNumber(rect.x + rect.width * 0.55)} ${formatNumber(rect.y + rect.height * 0.74)} L${formatNumber(rect.x + rect.width)} ${formatNumber(rect.y + rect.height * 0.42)}`))}</path>`;
      break;
    default: {
      // A bar with a value is a progress track; without one, a text line.
      if (valued) {
        const level = valueAt(0);
        body = `${timeline.element("rect", { ...rectTracks(frames), rx: frames.map(() => 3 * k) }, `fill="var(--ink)" opacity=".1"`)}
          ${timeline.element("rect", { height: frames.map((rect) => rect.height), rx: frames.map(() => 3 * k), width: frames.map((rect, key) => rect.width * level[key]), x: frames.map((rect) => rect.x), y: frames.map((rect) => rect.y) }, `fill="var(--accent)"`)}`;
      } else {
        body = timeline.element("rect", rectTracks(frames), `rx="${formatNumber(3 * k)}" fill="var(--ink)" opacity=".15"`);
      }
    }
  }
  // Cards and rows with a value show it as a progress strip along the bottom.
  if (valued && (element.kind === "card" || element.kind === "row")) {
    const level = valueAt(0);
    const track = (rect) => ({ height: 5 * k, width: rect.width * (element.kind === "row" ? 0.35 : 0.62), x: element.kind === "row" ? rect.x + rect.width * 0.55 : rect.x + 14 * k, y: element.kind === "row" ? rect.y + rect.height / 2 - 2.5 * k : rect.y + rect.height - 25 * k });
    body += `${timeline.element("rect", rectTracks(sized(track)), `rx="${formatNumber(2.5 * k)}" fill="var(--ink)" opacity=".1"`)}
      ${timeline.element("rect", rectTracks(frames.map((rect, key) => ({ ...track(rect), width: track(rect).width * level[key] }))), `rx="${formatNumber(2.5 * k)}" fill="var(--accent)"`)}`;
  }
  body += statusMarkup(element, frames, rx, statuses, timeline, k);
  return `<g data-plan-id="${escapeXml(id)}" opacity="${formatNumber(opacity[0])}">${timeline.animate("opacity", opacity)}${body}</g>`;
}

// A ring drawn over the element: a tinted cover would grey out its label.
function highlightMarkup(plan, id, views, keys, timeline, k, radius, stateAt) {
  const on = keys.map((key, index) => ((stateAt(key).highlight || []).includes(id) && views[index].opacity > 0 ? 1 : 0));
  if (on.every((value) => value === 0)) return "";
  const frames = elementFrames(id, views, keys);
  const rx = cornerTrack(plan.elements[id], frames, radius, k);
  return `<g opacity="${on[0]}">${timeline.animate("opacity", on)}${timeline.element("rect", { ...rectTracks(frames), rx }, `fill="none" class="ln-base" stroke="var(--accent)"`)}</g>`;
}

// Connectors run along the axes, never diagonally: out of one element's
// side, across, and into the other's. They draw on when linked and draw
// back when unlinked.
function linkMarkup(plan, views, keys, timeline, stateAt) {
  const pairs = [];
  for (const state of plan.states) for (const [from, to] of state.links || []) if (!pairs.some(([a, b]) => a === from && b === to)) pairs.push([from, to]);
  return pairs.map(([from, to]) => {
    const shown = keys.map((key, index) => ((stateAt(key).links || []).some(([a, b]) => a === from && b === to) && views[from][index].opacity > 0 && views[to][index].opacity > 0 ? 1 : 0));
    if (shown.every((value) => value === 0)) return "";
    const paths = keys.map((_, index) => {
      const a = views[from][index].rect;
      const b = views[to][index].rect;
      const [ac, bc] = [{ x: a.x + a.width / 2, y: a.y + a.height / 2 }, { x: b.x + b.width / 2, y: b.y + b.height / 2 }];
      if (Math.abs(bc.x - ac.x) >= Math.abs(bc.y - ac.y)) {
        const [ax, bx] = bc.x >= ac.x ? [a.x + a.width, b.x] : [a.x, b.x + b.width];
        const mid = (ax + bx) / 2;
        return `M${formatNumber(ax)} ${formatNumber(ac.y)} L${formatNumber(mid)} ${formatNumber(ac.y)} L${formatNumber(mid)} ${formatNumber(bc.y)} L${formatNumber(bx)} ${formatNumber(bc.y)}`;
      }
      const [ay, by] = bc.y >= ac.y ? [a.y + a.height, b.y] : [a.y, b.y + b.height];
      const mid = (ay + by) / 2;
      return `M${formatNumber(ac.x)} ${formatNumber(ay)} L${formatNumber(ac.x)} ${formatNumber(mid)} L${formatNumber(bc.x)} ${formatNumber(mid)} L${formatNumber(bc.x)} ${formatNumber(by)}`;
    });
    return timeline.element("path", { "stroke-dashoffset": shown.map((value) => 1 - value) }, `d="${paths[0]}" pathLength="1" stroke-dasharray="1 1" fill="none" class="ln-base" stroke="var(--accent)" stroke-linejoin="round"`, timeline.animateText("d", paths));
  }).join("");
}

// Containers draw first so items always sit on top of the panel they are in.
function paintOrder(plan) {
  const panels = new Set(plan.states.flatMap((state) => idsIn(state.layout).filter((id) => plan.elements[id]?.kind === "panel")));
  const ids = Object.keys(plan.elements);
  return [...ids.filter((id) => panels.has(id)), ...ids.filter((id) => !panels.has(id))];
}

export function composePlan(scene) {
  const frame = frameFor(scene.format);
  const plan = withFillers(scene.story.plan, frame);
  const k = sourceUnits(frame)(1);
  const radius = Math.max(0, (scene.palette.radius ?? 0) / frame.unitPx);
  const { clicks, keys } = planKeys(plan);
  const timeline = createTimeline(keys, scene.duration);
  const { layouts, views } = snapshots(plan, frame, keys);
  const stateAt = (key) => plan.states[key.status ?? key.ui];
  const used = new Set(plan.states.flatMap((state) => idsIn(state.layout)));
  const order = paintOrder(plan).filter((id) => used.has(id));
  const panelIds = order.filter((id) => plan.elements[id].kind === "panel");
  const markup = (id) => {
    const index = Object.keys(plan.elements).indexOf(id);
    return `${elementMarkup(id, index, plan.elements[id], views[id], keys, timeline, k, radius, scene.typography, stateAt)}${highlightMarkup(plan, id, views[id], keys, timeline, k, radius, stateAt)}`;
  };
  const elements = [
    ...panelIds.map(markup),
    linkMarkup(plan, views, keys, timeline, stateAt),
    ...order.filter((id) => !panelIds.includes(id)).map(markup),
  ].filter(Boolean).join("\n    ");

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

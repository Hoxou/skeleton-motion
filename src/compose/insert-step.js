import { frameFor } from "../layout/formats.js";
import { cursor } from "../render-svg.js";
import { backdrop, curveOver, fillStack, glyphLines, layoutMetadata, lerp, lerpRect, lineTracks, sourceUnits, stackRects, stackSlots, storyClock } from "./kit.js";
import { createTimeline, formatNumber, rectTracks } from "./tracks.js";

// Source proportions, measured from the product UI this story depicts (a
// flow step card, the step picker, and its options). Items keep these shapes
// in every format; only containers stretch. A region is filled by spacing and
// by how many items fit, never by distorting an item.
const CARD = Object.freeze({ height: 80, width: 300 });
const OPTION = Object.freeze({ height: 70, width: 260 });
// Narrow pickers show options as tiles (icon over label), like a node palette.
const OPTION_TILE = Object.freeze({ height: 86, width: 112 });
const OPTION_ROW_MIN_WIDTH = 180;
const PANEL_WIDTH = 300;
const PANEL_PAD = 20;
const PANEL_HEADER = 43;
const IDEAL_GAP = 34.5 / CARD.height;
const IDEAL_OPTION_GAP = 10 / OPTION.height;
// The flow fills its region with steps at the source rhythm, whose gap is
// just wide enough for the + control. Three is the fewest that keep a step
// on both sides of the insertion.
const MIN_STEPS = 3;
const MAX_STEPS = 16;
// Stacked steps take about half the frame and leave the rest to the picker.
const ROWS_SHARE = 0.55;
const NAVIGATE_COST = 0.05;
const MIN_GAP = 0.3;
const SHARE_RANGE = [0.38, 0.72];
// Source px the flow and the picker travel while they hand the frame over.
const HANDOFF_DRIFT = 30;
const ADD_RADIUS = 17 / CARD.height;

// Card content in card-local units (CARD.width x CARD.height).
const CARD_KINDS = Object.freeze([
  { bars: [110, 158], glyph: "plus", glyphOpacity: 0.76, glyphStroke: "var(--accent-2)" },
  { bars: [102, 150], glyph: "cross", glyphOpacity: 0.32, glyphStroke: "var(--ink)" },
  { bars: [126, 92], glyph: "plus", glyphOpacity: 0.32, glyphStroke: "var(--ink)" },
]);
const INSERTED = Object.freeze({ bars: [134, 86], glyph: "minus", glyphOpacity: 1, glyphStroke: "var(--accent)", ring: true });

// Story beats, normalized to the loop. Layout progress `p` blends the
// before/after layouts: every step moves one slot, the new one opens in the
// gap, and the step pushed past the region edge fades out over it.
// The pointer and the product take turns: the pointer travels while the UI is
// still, clicks, and waits for the reaction to settle before moving again.
// The rewind plays the insertion backwards once the pointer is back at rest:
// accents go out, the step turns pending again, then folds into the seam.
const KEYS = Object.freeze([
  { at: 0, p: 0 },
  { at: 0.07, p: 0 },
  { at: 0.22, p: 0 },
  { at: 0.26, p: 0 },
  { at: 0.28, p: 0 },
  { at: 0.29, ease: "quick", p: 0, press: "add" },
  { at: 0.31, ease: "quick", p: 0.2 },
  { at: 0.4, p: 1 },
  { at: 0.44, p: 1 },
  { at: 0.45, p: 1 },
  { at: 0.48, p: 1 },
  { at: 0.51, ease: "quick", p: 1 },
  { at: 0.6, p: 1 },
  { at: 0.62, ease: "quick", p: 1 },
  { at: 0.63, ease: "quick", p: 1, press: "option" },
  { at: 0.65, ease: "quick", p: 1 },
  { at: 0.66, p: 1 },
  { at: 0.67, p: 1 },
  { at: 0.7, ease: "quick", p: 1 },
  { at: 0.73, ease: "quick", p: 1 },
  { at: 0.76, p: 1 },
  { at: 0.8, p: 1 },
  { at: 0.86, p: 1 },
  { at: 0.89, p: 1 },
  { at: 0.99, p: 1 },
  { at: 1.04, p: 1 },
  { at: 1.11, p: 0.3 },
  { at: 1.14, p: 0 },
  { at: 1.18, p: 0 },
]);
const CLICKS = Object.freeze([0.29, 0.63]);
const REWIND = Object.freeze({ fold: 1.04, folded: 1.14, start: 1 });
// A navigating flow leaves after the new slot has opened, and returns once
// the picker has gone.
const HANDOFF = Object.freeze({ back: 0.73, gone: 0.48, leave: 0.45, pickerGone: 0.7, pickerIn: 0.51, pickerLeave: 0.67 });

const curve = curveOver(KEYS);

const aspect = CARD.width / CARD.height;
const inRange = (value, [low, high]) => value >= low && value <= high;

// Choose how the cast is staged in this frame: steps beside the picker,
// steps above it, or full-width steps that hand the whole frame to the
// picker while choosing (too narrow to show both without overlap). Cards
// keep their source shape and stay near their natural size, so a step reads
// the same in every asset; the winner has spacing closest to the source.
function arrange(frame) {
  const { gutter, safe } = frame;
  const intrinsic = sourceUnits(frame)(CARD.height);
  const across = safe.width - gutter;
  const candidates = [];
  const columns = fillStack({ gap: IDEAL_GAP, intrinsic, length: safe.height, max: MAX_STEPS, min: MIN_STEPS, minGap: MIN_GAP, sizeRange: SHARE_RANGE.map((share) => share * across / aspect) });
  if (columns) candidates.push({ axis: "columns", count: columns.count, gap: columns.gap, scale: columns.scale, size: columns.size * aspect });
  const fullWidth = safe.width / aspect;
  const fullScale = fullWidth / intrinsic;
  if (inRange(fullScale, [0.85, 1.15])) {
    const rows = [];
    for (let count = MIN_STEPS; count <= MAX_STEPS; count += 1) {
      const share = fullWidth * (count + (count - 1) * IDEAL_GAP) / (safe.height - gutter);
      if (inRange(share, SHARE_RANGE)) rows.push({ axis: "rows", count, gap: IDEAL_GAP, scale: fullScale, share, size: share * (safe.height - gutter) });
    }
    if (rows.length) candidates.push(rows.reduce((best, row) => (Math.abs(row.share - ROWS_SHARE) < Math.abs(best.share - ROWS_SHARE) ? row : best)));
    const navigate = fillStack({ gap: IDEAL_GAP, intrinsic: fullWidth, length: safe.height, max: MAX_STEPS, min: MIN_STEPS, minGap: MIN_GAP, scaleRange: [1, 1] });
    if (navigate) candidates.push({ axis: "navigate", count: navigate.count, gap: navigate.gap, scale: fullScale, size: safe.width });
  }
  const cost = ({ axis, gap, scale }) => Math.abs(gap - IDEAL_GAP) + Math.abs(scale - 1) + (axis === "navigate" ? NAVIGATE_COST : 0);
  if (candidates.length === 0) throw new Error(`insert-step cannot stage ${safe.width}x${safe.height}`);
  return candidates.reduce((best, candidate) => (cost(candidate) < cost(best) ? candidate : best));
}

function regionsFor(frame, arrangement) {
  const { gutter, safe } = frame;
  if (arrangement.axis === "navigate") return { picker: { ...safe }, steps: { ...safe } };
  if (arrangement.axis === "columns") {
    return {
      picker: { height: safe.height, width: safe.width - gutter - arrangement.size, x: safe.x + arrangement.size + gutter, y: safe.y },
      steps: { height: safe.height, width: arrangement.size, x: safe.x, y: safe.y },
    };
  }
  return {
    picker: { height: safe.height - gutter - arrangement.size, width: safe.width, x: safe.x, y: safe.y + arrangement.size + gutter },
    steps: { height: arrangement.size, width: safe.width, x: safe.x, y: safe.y },
  };
}

// Panel chrome and option rows follow the shared type scale `k`: rows have a
// natural height and stretch to the panel; narrow panels switch to tiles.
function pickerLayout(panel, k) {
  const pad = PANEL_PAD * k;
  const optionWidth = panel.width - pad * 2;
  const tiles = optionWidth < OPTION_ROW_MIN_WIDTH * k;
  const shape = tiles ? OPTION_TILE : OPTION;
  const optionHeight = shape.height * k;
  const top = panel.y + PANEL_HEADER * k;
  const list = { height: panel.y + panel.height - pad - top, width: optionWidth, x: panel.x + pad, y: top };
  const stack = fillStack({ gap: IDEAL_OPTION_GAP, intrinsic: optionHeight, length: list.height, min: 2, minGap: 0, scaleRange: [1, 1] });
  return { list, options: stackRects(list, "y", stack), pad, scale: k, shape, tiles };
}

// Card content placed at the card's uniform scale: it grows with the card and
// never stretches. Strokes stay role-sized because geometry is computed, not
// transformed.
function cardContent(timeline, rects, kind, tag) {
  const scales = rects.map((rect) => Math.min(rect.width / CARD.width, rect.height / CARD.height));
  const origin = rects.map((rect, index) => ({ x: rect.x, y: rect.y + (rect.height - CARD.height * scales[index]) / 2 }));
  const at = (index, x, y) => ({ x: origin[index].x + x * scales[index], y: origin[index].y + y * scales[index] });
  const avatar = timeline.element("circle", {
    cx: rects.map((_, index) => at(index, 36, 40).x),
    cy: rects.map((_, index) => at(index, 36, 40).y),
    r: scales.map((scale) => 15 * scale),
  }, `fill="var(--tag-${tag})"${kind.ring ? ` class="ln-hair" stroke="var(--accent)" stroke-opacity=".42"` : ""}`);
  const glyphs = glyphLines(kind.glyph, 0, 0, 1).map((_, part) => timeline.element("line", lineTracks(rects.map((_, index) => {
    const middle = at(index, 36, 40);
    return glyphLines(kind.glyph, middle.x, middle.y, 7 * scales[index])[part];
  })), `class="ln-strong" stroke="${kind.glyphStroke}" opacity="${kind.glyphOpacity}" stroke-linecap="round"`)).join("");
  const bars = kind.bars.map((width, row) => timeline.element("rect", {
    height: scales.map((scale) => 5 * scale),
    rx: scales.map((scale) => 2.5 * scale),
    width: scales.map((scale) => width * scale),
    x: rects.map((_, index) => at(index, 67, 27 + row * 14).x),
    y: rects.map((_, index) => at(index, 67, 27 + row * 14).y),
  }, `${row ? `class="lod-fine" ` : ""}fill="var(--ink)" opacity="${row ? 0.1 : 0.2}"`)).join("");
  const bounds = rects.map((_, index) => ({ height: CARD.height * scales[index], width: CARD.width * scales[index], ...origin[index] }));
  return { bounds, markup: avatar + glyphs + bars };
}

export function composeInsertStep(scene) {
  const frame = frameFor(scene.format);
  const arrangement = arrange(frame);
  const regions = regionsFor(frame, arrangement);
  const steps = regions.steps;
  const cardHeight = steps.width * CARD.height / CARD.width;
  const count = arrangement.count;
  // The insertion pushes steps toward the region edge that is also the frame
  // edge, so the one that overflows never passes over the picker.
  const exitsAtEnd = arrangement.axis !== "rows";
  const slot = stackSlots(steps, "y", { count, gap: arrangement.gap, size: cardHeight });
  const insertAt = Math.floor(count / 2);
  const before = Array.from({ length: count }, (_, index) => slot(index));
  const after = before.map((_, index) => (exitsAtEnd ? slot(index < insertAt ? index : index + 1) : slot(index < insertAt ? index - 1 : index)));
  const exiting = exitsAtEnd ? count - 1 : 0;
  const insertedSlot = exitsAtEnd ? slot(insertAt) : slot(insertAt - 1);
  const seam = { x: steps.x + steps.width / 2, y: (before[insertAt - 1].y + before[insertAt - 1].height + before[insertAt].y) / 2 };
  // The + sits in the gap between two steps, so it never grows past it.
  const addRadius = Math.min(ADD_RADIUS, arrangement.gap * 0.45) * cardHeight;
  const addRect = { height: addRadius * 2, width: addRadius * 2, x: seam.x - addRadius, y: seam.y - addRadius };
  const radius = Math.max(0, (scene.palette.radius ?? 0) / frame.unitPx);
  const timeline = createTimeline(KEYS, scene.duration);
  const progress = KEYS.map(({ p }) => p);

  // Narrow frames have no room for the picker beside the steps, and a picker
  // drawn over them hides what it is changing. The flow leaves before the
  // picker arrives and returns only after it has gone, both along one axis
  // (out up, back down), so the two never share the frame.
  const navigate = arrangement.axis === "navigate";
  const drift = navigate ? sourceUnits(frame)(HANDOFF_DRIFT) : 0;
  const { back, gone, leave, pickerGone, pickerIn, pickerLeave } = HANDOFF;
  const flowOpacity = navigate ? curve([[0, 1], [leave, 1], [gone, 0], [pickerGone, 0], [back, 1], [1, 1]]) : KEYS.map(() => 1);
  const flowShift = curve([[0, 0], [leave, 0], [gone, -drift], [pickerGone, -drift], [back, 0], [1, 0]]);
  const pickerShift = curve([[0, drift], [gone, drift], [pickerIn, 0], [pickerLeave, 0], [pickerGone, drift], [1, drift]]);
  const pickerOpacity = navigate ? curve([[0, 0], [gone, 0], [pickerIn, 1], [pickerLeave, 1], [pickerGone, 0], [1, 0]]) : undefined;
  const shifted = (rect, dy) => ({ ...rect, y: rect.y + dy });

  const existing = before.map((rect, index) => ({
    frames: progress.map((p, key) => shifted(lerpRect(rect, after[index], p), flowShift[key])),
    index,
  }));
  const inserted = progress.map((p, key) => shifted(lerpRect(addRect, insertedSlot, p), flowShift[key]));
  const insertedRadius = progress.map((p) => lerp(addRadius, Math.min(radius, cardHeight / 2), p));
  // Fades out while pushed over the edge, and back in as the rewind returns it.
  const exitOpacity = curve([[0, 1], [0.29, 1], [0.4, 0], [REWIND.fold, 0], [REWIND.folded, 1]]);

  const layers = {};
  const cards = existing.map(({ frames, index }) => {
    const kind = index === 0 ? CARD_KINDS[0] : index === before.length - 1 ? CARD_KINDS[1] : CARD_KINDS[2];
    const content = cardContent(timeline, frames, { ...kind, bars: kind.bars.map((bar) => bar - (index % 3) * 12) }, (index % 4) + 1);
    const exits = index === exiting;
    const opacity = exits ? exitOpacity.map((value, key) => value * flowOpacity[key]) : navigate ? flowOpacity : undefined;
    layers[`step-${index}`] = { aspect: CARD.width / CARD.height, content: content.bounds, frames, opacity, overflow: exits, region: "steps", role: "fill" };
    return `<g id="step-${index}">${exits ? timeline.animate("opacity", exitOpacity) : ""}
      ${timeline.element("rect", rectTracks(frames), `rx="${formatNumber(radius)}" data-fill="steps" class="ln-hair" fill="var(--surface)" stroke="var(--border-strong)"`)}
      ${content.markup}
    </g>`;
  }).join("");

  const groupOpacity = curve([[0, 0], [0.29, 0], [0.31, 1], [REWIND.folded - 0.03, 1], [REWIND.folded, 0]]);
  // A navigating flow is away while the choice is made, so its new step
  // settles after it returns, where the change can be seen.
  const settle = navigate ? [back, 0.8] : [0.63, 0.7];
  const dashed = curve([[0, 1], [settle[0], 1], [settle[1], 0], [REWIND.start, 0], [REWIND.fold, 1]]);
  const solid = curve([[0, 0], [settle[0], 0], [settle[1], 1], [REWIND.start, 1], [REWIND.fold, 0]]);
  const insertedContent = cardContent(timeline, inserted, INSERTED, 2);
  layers.inserted = { content: insertedContent.bounds, frames: inserted, opacity: groupOpacity.map((value, key) => value * flowOpacity[key]), region: "steps", role: "fill" };
  const insertedMarkup = `<g id="inserted-step" opacity="0">${timeline.animate("opacity", groupOpacity)}
    ${timeline.element("rect", { ...rectTracks(inserted), opacity: dashed, rx: insertedRadius }, `data-fill="steps" class="ln-base" fill="var(--accent-soft)" stroke="var(--accent)" stroke-dasharray="14 12"`)}
    ${timeline.element("rect", { ...rectTracks(inserted), opacity: solid, rx: insertedRadius }, `data-fill="steps" class="ln-base" fill="var(--accent-soft)" stroke="var(--accent)"`)}
    ${insertedContent.markup}
  </g>`;

  // The base connector runs between the first and last slots, so it only
  // moves with the flow as a whole; accent segments light up once settled.
  const first = slot(0);
  const last = slot(count - 1);
  const above = { ...insertedSlot, y: insertedSlot.y - cardHeight * (1 + arrangement.gap) };
  const below = { ...insertedSlot, y: insertedSlot.y + cardHeight * (1 + arrangement.gap) };
  const line = (y1, y2, tracks, attributes) => timeline.element("line", {
    ...tracks, x1: KEYS.map(() => seam.x), x2: KEYS.map(() => seam.x), y1: flowShift.map((dy) => y1 + dy), y2: flowShift.map((dy) => y2 + dy),
  }, attributes);
  const segment = (y1, y2, points) => line(y1, y2, { opacity: curve(points) }, `class="ln-strong" stroke="var(--accent)"`);
  const connectors = `${line(first.y + first.height, last.y, {}, `class="ln-base" stroke="var(--border-strong)"`)}
    ${segment(above.y + above.height, insertedSlot.y, [[0, 0], [settle[1], 0], [navigate ? 0.86 : 0.76, 1], [REWIND.start, 1], [REWIND.fold, 0]])}
    ${segment(insertedSlot.y + insertedSlot.height, below.y, [[0, 0], [navigate ? settle[1] : 0.73, 0], [navigate ? 0.86 : 0.8, 1], [REWIND.start, 1], [REWIND.fold, 0]])}`;

  const addScale = KEYS.map(({ press }) => (press === "add" ? 0.88 : 1));
  // The + is revealed by the pointer hovering the seam, as in the product.
  const addOpacity = curve([[0, 0], [0.22, 0], [0.26, 1], [0.29, 1], [0.31, 0], [1, 0]]);
  const addButton = `<g id="add-step" opacity="0">${timeline.animate("opacity", addOpacity)}
    ${timeline.element("circle", { r: addScale.map((scale) => addRadius * scale) }, `cx="${formatNumber(seam.x)}" cy="${formatNumber(seam.y)}" class="ln-hair" fill="var(--surface)" stroke="var(--accent)"`)}
    ${glyphLines("plus", 0, 0, 1).map((_, part) => timeline.element("line", lineTracks(addScale.map((scale) => glyphLines("plus", seam.x, seam.y, addRadius * 0.41 * scale)[part])), `class="ln-strong" stroke="var(--accent)" stroke-linecap="round"`)).join("")}
  </g>`;
  layers.add = {
    frames: addScale.map((scale) => ({ height: addRect.height * scale, width: addRect.width * scale, x: seam.x - addRadius * scale, y: seam.y - addRadius * scale })),
    opacity: addOpacity,
    region: "steps",
    role: "overlay",
  };

  const panel = regions.picker;
  const picker = pickerLayout(panel, sourceUnits(frame)(1));
  const optionScale = picker.scale;
  const place = (rect, key) => shifted(rect, pickerShift[key]);
  const placedTracks = (rect, adjust = () => rect) => rectTracks(KEYS.map((_, key) => place(adjust(key), key)));
  const scaleAbout = (rect, scale) => ({ height: rect.height * scale, width: rect.width * scale, x: rect.x + rect.width * (1 - scale) / 2, y: rect.y + rect.height * (1 - scale) / 2 });
  const highlight = curve([[0, 0], [0.6, 0], [0.62, 0.08], [0.63, 0.42], [0.66, 0.16], [0.76, 0], [1, 0]]);
  // The press shows on the option's icon; the option outline stays pinned to
  // the list edges.
  const pressScale = KEYS.map(({ press }) => (press === "option" ? 0.88 : 1));
  const options = picker.options.map((rect, index) => {
    const frames = KEYS.map((_, key) => place(rect, key));
    layers[`option-${index}`] = { frames, height: picker.shape.height * optionScale, opacity: pickerOpacity, region: "list", role: "fill" };
    const local = (x, y, width, height) => ({ height: height * optionScale, width: width * optionScale, x: rect.x + x * optionScale, y: rect.y + y * optionScale });
    const centered = (y, width, height) => ({ height: height * optionScale, width: width * optionScale, x: rect.x + (rect.width - width * optionScale) / 2, y: rect.y + y * optionScale });
    const labelWidth = index === 0 ? 104 : 82 - (index % 2) * 14;
    const tile = picker.tiles ? centered(16, 30, 30) : local(18, 20, 30, 30);
    const bar = picker.tiles ? centered(60, Math.min(labelWidth * 0.6, rect.width / optionScale - 24), 8) : local(64, 27, labelWidth, 8);
    const tileRadius = Math.min(radius, 15 * optionScale);
    return `<g${index === 0 ? ` id="picked-option"` : ""}>
      ${timeline.element("rect", rectTracks(frames), `rx="${formatNumber(radius)}" data-fill="list" class="ln-hair" fill="var(--surface)" stroke="var(--border)"`)}
      ${index === 0 ? timeline.element("rect", { ...rectTracks(frames), opacity: highlight }, `rx="${formatNumber(radius)}" class="ln-base" fill="var(--accent-soft)" stroke="var(--accent)"`) : ""}
      ${timeline.element("rect", placedTracks(tile, (key) => (index === 0 ? scaleAbout(tile, pressScale[key]) : tile)), `rx="${formatNumber(tileRadius)}" fill="var(--tag-${(index % 4) + 1})"`)}
      ${timeline.element("rect", placedTracks(bar), `rx="${formatNumber(4 * optionScale)}" fill="var(--ink)" opacity="${index === 0 ? ".2" : ".11"}"`)}
    </g>`;
  }).join("");
  const headerBar = (offset, width, extra) => {
    const room = picker.list.width - offset * picker.scale;
    if (room <= 7 * picker.scale) return "";
    return timeline.element("rect", placedTracks({ height: 7 * picker.scale, width: Math.min(width * picker.scale, room), x: panel.x + picker.pad + offset * picker.scale, y: panel.y + picker.pad }), `rx="${formatNumber(3.5 * picker.scale)}" ${extra}`);
  };
  const pickerMarkup = `<g id="step-picker"${navigate ? ` opacity="0"` : ""}>${navigate ? timeline.animate("opacity", pickerOpacity) : ""}
    ${timeline.element("rect", placedTracks(panel), `rx="${formatNumber(radius)}" data-fill="picker" class="ln-hair" fill="var(--surface)" stroke="var(--border)"`)}
    ${headerBar(0, 72, `fill="var(--ink)" opacity=".14"`)}
    ${headerBar(80, 42, `class="lod-fine" fill="var(--ink)" opacity=".07"`)}
    ${options}
  </g>`;
  layers.picker = { frames: KEYS.map((_, key) => place(panel, key)), opacity: pickerOpacity, region: "picker", role: "fill" };

  const option = picker.options[0];
  const rest = navigate
    ? { x: frame.safe.x + frame.safe.width - 60, y: frame.safe.y + frame.safe.height - 90 }
    : { x: panel.x + panel.width - 26 * picker.scale, y: panel.y + panel.height - 30 * picker.scale };
  const optionPoint = { x: option.x + option.width * 0.46, y: option.y + option.height / 2 };
  const pointer = cursor({ ...scene, timing: storyClock(KEYS) }, [
    { at: 0, ...rest }, { at: 0.1, ...rest },
    { at: 0.22, ...seam }, { at: 0.52, ...seam },
    { at: 0.6, ...optionPoint }, { at: 0.89, ...optionPoint },
    { at: 0.99, ...rest }, { at: KEYS.at(-1).at, ...rest },
  ].map((point) => ({ at: point.at, x: formatNumber(point.x), y: formatNumber(point.y) })), CLICKS);

  // A navigating picker is hidden and drifted off its region in the opening
  // frame static renderers show, so only the steps region is declared.
  const layoutRegions = navigate ? { steps } : { list: picker.list, picker: panel, steps };

  return {
    content: `
    ${layoutMetadata(scene.format, layoutRegions)}
    ${backdrop(scene, frame)}
    <g id="flow">${timeline.animate("opacity", flowOpacity)}
    ${connectors}
    ${cards}
    ${insertedMarkup}
    </g>
    ${addButton}
    ${pickerMarkup}
    ${pointer}`,
    model: { arrangement, frame, keys: KEYS, layers, regions: layoutRegions, sizes: { cardHeight, count, optionCount: picker.options.length } },
    referenceWidth: frame.referenceWidth,
    viewBox: { height: frame.height, width: frame.width },
  };
}

export const __testing = { CARD, HANDOFF, IDEAL_GAP, KEYS, OPTION, arrange };

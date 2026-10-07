import { frameFor } from "../layout/formats.js";
import { inset } from "../layout/solve.js";
import { cursor } from "../render-svg.js";
import { backdrop, center, curveOver, fillStack, layoutMetadata, sourceUnits, stackRects, storyClock } from "./kit.js";
import { createTimeline, formatNumber } from "./tracks.js";

// Source proportions (source px) for a canvas with a color control. The
// canvas and inspector are containers; the shape and swatches keep their
// shape. Wide frames dock an inspector, narrow ones float a toolbar.
const INSPECTOR = Object.freeze({ field: 26, minCanvas: 260, pad: 20, share: 0.3, width: 220 });
const SWATCH = 34;
const SWATCH_GAP = 10;
const FIELD_GAP = 12;
const TOOLBAR_PAD = 12;
const SHAPE_RADIUS = 70;
const PICKED = 2;
// A one-hue system offers a tint scale; a multicolor system offers its roles.
// Rows wider than four swatches continue the scale (tints) or add lighter
// shades of the roles, so a filled row never repeats a color.
const TINTS = [22, 40, 62, 86, 12, 52, 74, 96];
// The hex readout changes length with the value it shows.
const HEX_WIDTHS = [56, 64, 70, 60];
const CLICKS_START = 0.08;
const CLICKS_END = 0.88;
// After the pointer is back at rest, the last pick reverts to swatch 0: the
// opening color fades in under the picked one before it fades out, so the
// shape never thins through to the canvas.
const REVERT = Object.freeze({ end: 1.06, start: 1 });
const REST_AT = 0.98;
const LOOP = 1.12;

// `story.picks` lists the swatches clicked in order, starting from swatch 0.
// A cycle that ends back on swatch 0 loops without the closing color revert.
function pickBeats(story) {
  const picks = story?.picks?.length ? story.picks : [PICKED];
  const span = (CLICKS_END - CLICKS_START) / picks.length;
  const states = [0, ...picks];
  return picks.map((to, index) => {
    const at = (offset) => CLICKS_START + span * (index + offset / 0.8);
    return { at, from: states[index], index, to };
  });
}

function timelineKeys(beats) {
  return Object.freeze([
    { at: 0 }, { at: CLICKS_START },
    ...beats.flatMap(({ at, index }) => [
      ...(index > 0 ? [{ at: at(0) }] : []),
      { at: at(0.22), ease: "quick" }, { at: at(0.25), ease: "quick" }, { at: at(0.28) }, { at: at(0.34) },
    ]),
    { at: CLICKS_END }, { at: REST_AT }, { at: REVERT.start }, { at: REVERT.start + 0.02 }, { at: REVERT.start + 0.03 },
    { at: REVERT.end - 0.02 }, { at: REVERT.end }, { at: LOOP },
  ]);
}

// Opacity of the layer showing swatch `swatch`: it fades out when a click
// leaves it and in (after `lag`) when a click lands on it.
function layerPoints(beats, swatch, lag = 0) {
  const shown = (state) => (state === swatch ? 1 : 0);
  const final = beats.at(-1).to;
  const revert = swatch === 0 ? [REVERT.start, REVERT.end - 0.02] : [REVERT.start + 0.02, REVERT.end];
  return [
    [0, shown(0)],
    ...beats.flatMap(({ at, from, to }) => {
      if (from === to) return [];
      if (from === swatch) return [[at(0.22), 1], [at(0.28), 0]];
      if (to === swatch) return [[at(0.22) + lag, 0], [at(0.28) + lag, 1]];
      return [];
    }),
    [revert[0], shown(final)],
    [revert[1], shown(0)],
  ];
}

function hexWidthPoints(beats) {
  return [
    [0, HEX_WIDTHS[0]],
    ...beats.flatMap(({ at, from, to }) => [[at(0.22), HEX_WIDTHS[from]], [at(0.28), HEX_WIDTHS[to]]]),
    [REVERT.start, HEX_WIDTHS[beats.at(-1).to]],
    [REVERT.end, HEX_WIDTHS[0]],
  ];
}

function ringPoints(beats, swatch) {
  return [
    [0, 0],
    ...beats.flatMap(({ at, from, index, to }) => {
      if (from === to) return [];
      if (to === swatch) return [[at(0.22), 0], [at(0.25), 1]];
      if (from === swatch && index > 0) return [[at(0.22), 1], [at(0.25), 0]];
      return [];
    }),
    [REVERT.start, beats.at(-1).to === swatch ? 1 : 0],
    [REVERT.start + 0.03, 0],
  ];
}

function swatchFill(palette, index) {
  if (palette.colorMode === "multicolor" && palette.pastels?.length) {
    const role = `var(--tag-${(index % 4) + 1})`;
    return index < 4 ? role : `color-mix(in oklab, ${role} ${index < 8 ? 55 : 30}%, var(--surface))`;
  }
  return `color-mix(in oklab, var(--accent) ${TINTS[index % TINTS.length]}%, var(--surface))`;
}

const rectAttrs = (rect) => `x="${formatNumber(rect.x)}" y="${formatNumber(rect.y)}" width="${formatNumber(rect.width)}" height="${formatNumber(rect.height)}"`;

// Swatches are a list: the row takes as many as fit at the natural gap.
function swatchRow(row, k, palette, radius, timeline, beats, curve) {
  const size = SWATCH * k;
  const stack = fillStack({ gap: SWATCH_GAP / SWATCH, intrinsic: size, length: row.width, max: 12, min: 4, minGap: 0, scaleRange: [1, 1] });
  const cells = stackRects(row, "x", stack).map((cell) => ({ ...cell, height: size, y: row.y + (row.height - size) / 2 }));
  const ring = 4 * k;
  const picked = new Set(beats.map(({ to }) => to));
  const markup = cells.map((cell, index) => `<rect ${rectAttrs(cell)} rx="${formatNumber(Math.min(radius, size / 2))}" fill="${swatchFill(palette, index)}" />
    ${picked.has(index) ? timeline.element("rect", { opacity: curve(ringPoints(beats, index)) }, `${rectAttrs(inset(cell, -ring))} rx="${formatNumber(Math.min(radius + ring, size / 2 + ring))}" fill="none" class="ln-strong" stroke="var(--accent)"`) : ""}`).join("");
  return { cells, markup };
}

export function composeAssignColor(scene) {
  const frame = frameFor(scene.format);
  const k = sourceUnits(frame)(1);
  const { gutter, safe } = frame;
  const radius = Math.max(0, (scene.palette.radius ?? 0) / frame.unitPx);
  const beats = pickBeats(scene.story);
  const keys = timelineKeys(beats);
  const curve = curveOver(keys);
  const timeline = createTimeline(keys, scene.duration);
  const shownSwatches = [...new Set([0, ...beats.map(({ to }) => to)])];
  const inspectorWidth = Math.max(INSPECTOR.width * k, (safe.width - gutter) * INSPECTOR.share);
  const docked = safe.width - gutter - inspectorWidth >= INSPECTOR.minCanvas * k;
  const canvas = docked ? { height: safe.height, width: safe.width - gutter - inspectorWidth, x: safe.x, y: safe.y } : { ...safe };

  let controls;
  let swatches;
  if (docked) {
    const panel = { height: safe.height, width: inspectorWidth, x: canvas.x + canvas.width + gutter, y: safe.y };
    const inner = inset(panel, INSPECTOR.pad * k);
    const row = { height: SWATCH * k, width: inner.width, x: inner.x, y: inner.y + 44 * k };
    swatches = swatchRow(row, k, scene.palette, radius, timeline, beats, curve);
    const fieldTop = row.y + row.height + 20 * k;
    const fieldArea = { height: inner.y + inner.height - fieldTop, width: inner.width, x: inner.x, y: fieldTop };
    const fields = stackRects(fieldArea, "y", fillStack({ gap: FIELD_GAP / INSPECTOR.field, intrinsic: INSPECTOR.field * k, length: fieldArea.height, min: 1, minGap: 0, scaleRange: [1, 1] }));
    const hexDot = { cx: fields[0].x + 13 * k, cy: fields[0].y + fields[0].height / 2, r: 6 * k };
    controls = `<g id="inspector">
      <rect ${rectAttrs(panel)} rx="${formatNumber(radius)}" data-fill="inspector" class="ln-hair" fill="var(--surface)" stroke="var(--border)" />
      <rect x="${formatNumber(inner.x)}" y="${formatNumber(inner.y)}" width="${formatNumber(72 * k)}" height="${formatNumber(7 * k)}" rx="${formatNumber(3.5 * k)}" fill="var(--ink)" opacity=".14" />
      <rect x="${formatNumber(inner.x)}" y="${formatNumber(inner.y + 24 * k)}" width="${formatNumber(40 * k)}" height="${formatNumber(6 * k)}" rx="${formatNumber(3 * k)}" fill="var(--ink)" opacity=".1" />
      ${swatches.markup}
      ${fields.map((field, index) => `<rect ${rectAttrs(field)} rx="${formatNumber(Math.min(radius, field.height / 2))}" fill="var(--muted)" />
        ${index === 0 ? "" : `<rect class="lod-fine" x="${formatNumber(field.x + 12 * k)}" y="${formatNumber(field.y + field.height / 2 - 3 * k)}" width="${formatNumber((index % 2 ? 64 : 48) * k)}" height="${formatNumber(6 * k)}" rx="${formatNumber(3 * k)}" fill="var(--ink)" opacity=".1" />`}`).join("")}
      <circle cx="${formatNumber(hexDot.cx)}" cy="${formatNumber(hexDot.cy)}" r="${formatNumber(hexDot.r)}" fill="${swatchFill(scene.palette, 0)}" />
      ${shownSwatches.slice(1).map((swatch) => timeline.element("circle", { opacity: curve(layerPoints(beats, swatch)) }, `cx="${formatNumber(hexDot.cx)}" cy="${formatNumber(hexDot.cy)}" r="${formatNumber(hexDot.r)}" fill="${swatchFill(scene.palette, swatch)}"`)).join("")}
      ${timeline.element("rect", { width: curve(hexWidthPoints(beats)).map((width) => width * k) }, `x="${formatNumber(hexDot.cx + 14 * k)}" y="${formatNumber(hexDot.cy - 3 * k)}" height="${formatNumber(6 * k)}" rx="${formatNumber(3 * k)}" fill="var(--ink)" opacity=".16"`)}
    </g>`;
  } else {
    const width = (SWATCH * 4 + SWATCH_GAP * 3 + TOOLBAR_PAD * 2) * k;
    const height = (SWATCH + TOOLBAR_PAD * 2) * k;
    const toolbar = { height, width, x: canvas.x + (canvas.width - width) / 2, y: canvas.y + canvas.height - height - 28 * k };
    swatches = swatchRow(inset(toolbar, TOOLBAR_PAD * k), k, scene.palette, radius, timeline, beats, curve);
    controls = `<g id="toolbar">
      <rect ${rectAttrs(toolbar)} rx="${formatNumber(Math.min(radius + TOOLBAR_PAD * k, height / 2))}" class="ln-hair" fill="var(--surface)" stroke="var(--border)" filter="url(#popover-shadow)" />
      ${swatches.markup}
    </g>`;
  }

  const stage = docked ? canvas : { ...canvas, height: canvas.height - (SWATCH + TOOLBAR_PAD * 2 + 28) * k };
  const shapeCenter = center(stage);
  const baseRadius = Math.min(SHAPE_RADIUS * k * 1.4, Math.min(stage.width, stage.height) * 0.3);
  const pulse = curve([[0, 1], ...beats.flatMap(({ at }) => [[at(0.22), 1], [at(0.3), 1.04], [at(0.34), 1]]), [1, 1]]);
  const shape = (fill, opacity) => timeline.element("circle", { opacity, r: pulse.map((value) => baseRadius * value) }, `cx="${formatNumber(shapeCenter.x)}" cy="${formatNumber(shapeCenter.y)}" fill="${fill}"`);

  const swatchAt = (index) => center(swatches.cells[index]);
  const rest = { x: canvas.x + canvas.width * 0.78, y: canvas.y + canvas.height * 0.82 };
  const pointer = cursor({ ...scene, timing: storyClock(keys) }, [
    { at: 0, ...rest },
    // Each move starts after the previous color has settled (by at(0.34)).
    ...beats.flatMap(({ at, from, index, to }) => [
      { at: at(0.06), ...(index > 0 ? swatchAt(from) : rest) },
      { at: at(0.2), ...swatchAt(to) },
    ]),
    { at: CLICKS_END, ...swatchAt(beats.at(-1).to) }, { at: REST_AT, ...rest }, { at: LOOP, ...rest },
  ].map((point) => ({ at: point.at, x: formatNumber(point.x), y: formatNumber(point.y) })), beats.map(({ at }) => at(0.22)));

  const regions = docked ? { canvas, inspector: { height: safe.height, width: inspectorWidth, x: canvas.x + canvas.width + gutter, y: safe.y } } : { canvas };
  return {
    content: `
    <defs><filter id="popover-shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000" flood-opacity=".1" /></filter></defs>
    ${layoutMetadata(scene.format, regions)}
    ${backdrop(scene, frame)}
    <rect ${rectAttrs(canvas)} rx="${formatNumber(radius)}" data-fill="canvas" class="ln-hair" fill="var(--surface)" stroke="var(--border)" />
    ${shownSwatches.map((swatch) => shape(swatchFill(scene.palette, swatch), curve(layerPoints(beats, swatch, 0.01)))).join("\n    ")}
    ${controls}
    ${pointer}`,
    model: { docked, frame, keys, regions },
    referenceWidth: frame.referenceWidth,
    viewBox: { height: frame.height, width: frame.width },
  };
}


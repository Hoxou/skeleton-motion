import { frameFor } from "../layout/formats.js";
import { cursor, pointerTrack } from "../render-svg.js";
import { center, curveOver, layoutMetadata, sourceUnits, storyClock } from "./kit.js";
import { createTimeline, formatNumber } from "./tracks.js";

// Source proportions (source px): a layout canvas with its own dotted grid
// and one shape dragged into place. The canvas is the container; the shape
// keeps its size, and the grid pitch follows the shared type scale.
const GRID = 24;
const SHAPE = 84;
const GUIDE = 120;

// The pointer drags the shape onto the grid, then picks it up again and
// carries it back to where the loop opens.
const KEYS = Object.freeze([
  { at: 0 }, { at: 0.08 }, { at: 0.2, ease: "smoothMove" }, { at: 0.24, ease: "quick" }, { at: 0.28 },
  { at: 0.38 }, { at: 0.48 }, { at: 0.52 }, { at: 0.6 }, { at: 0.7 }, { at: 0.76, ease: "quick" }, { at: 0.8 },
  { at: 1 }, { at: 1.04 }, { at: 1.05 }, { at: 1.15 }, { at: 1.2 },
]);
const CLICKS = Object.freeze([0.24, 0.76]);
const curve = curveOver(KEYS);

const rectAttrs = (rect) => `x="${formatNumber(rect.x)}" y="${formatNumber(rect.y)}" width="${formatNumber(rect.width)}" height="${formatNumber(rect.height)}"`;

export function composeSnapToGrid(scene) {
  const frame = frameFor(scene.format);
  const k = sourceUnits(frame)(1);
  const canvas = { ...frame.safe };
  const radius = Math.max(0, (scene.palette.radius ?? 0) / frame.unitPx);
  const timeline = createTimeline(KEYS, scene.duration);
  const pitch = GRID * k;
  const size = SHAPE * k;
  const snap = (value, origin) => origin + Math.round((value - origin) / pitch) * pitch;
  const middle = center(canvas);
  const target = { x: snap(middle.x + canvas.width * 0.08, canvas.x), y: snap(middle.y, canvas.y) };
  const start = { x: target.x - canvas.width * 0.28, y: target.y - canvas.height * 0.22 };
  // Lift is drawn in the shape's own coordinates, around its center; where
  // the shape is comes only from the drag track below.
  const lift = curve([[0, 0], [0.24, 0], [0.28, 1], [0.48, 1], [0.52, 0], [0.76, 0], [0.8, 1], [1, 1], [1.04, 0]]);
  const grown = lift.map((value) => size * (1 + 0.04 * value));
  const guides = curve([[0, 0], [0.3, 0], [0.38, 1], [0.6, 1], [0.7, 0], [1, 0]]);
  const span = Math.min(GUIDE * k, canvas.width / 2 - pitch, canvas.height / 2 - pitch);

  const dots = `<pattern id="canvas-grid" x="${formatNumber(canvas.x)}" y="${formatNumber(canvas.y)}" width="${formatNumber(pitch)}" height="${formatNumber(pitch)}" patternUnits="userSpaceOnUse"><circle cx="${formatNumber(pitch / 2)}" cy="${formatNumber(pitch / 2)}" r="${formatNumber(1.25 * k)}" fill="var(--border-strong)" /></pattern>`;
  const grabOffset = size * 0.18;
  const grab = { x: start.x + grabOffset, y: start.y + grabOffset };
  const dropped = { x: target.x + grabOffset, y: target.y + grabOffset };
  const rest = { x: canvas.x + canvas.width * 0.84, y: canvas.y + canvas.height * 0.84 };
  // The pointer and the shape share one list of beats, so the shape gets the
  // pointer's exact timing and easing while carried and holds still
  // otherwise. Nothing overshoots the cell because snapping is the point.
  const beats = [
    { at: 0, pointer: rest, shape: start }, { at: 0.08, pointer: rest, shape: start },
    { at: 0.22, pointer: grab, shape: start }, { at: 0.28, pointer: grab, shape: start },
    { at: 0.48, pointer: dropped, shape: target }, { at: 0.8, pointer: dropped, shape: target },
    { at: 1, pointer: grab, shape: start }, { at: 1.05, pointer: grab, shape: start },
    { at: 1.15, pointer: rest, shape: start }, { at: KEYS.at(-1).at, pointer: rest, shape: start },
  ];
  const clock = { ...scene, timing: storyClock(KEYS) };
  const track = (role) => beats.map(({ at, [role]: point }) => ({ at, x: formatNumber(point.x), y: formatNumber(point.y) }));
  // The static transform is the opening position for non-animating renderers.
  const shapeMarkup = `<g transform="translate(${formatNumber(start.x)} ${formatNumber(start.y)})">
      ${pointerTrack(clock, track("shape"))}
      ${timeline.element("rect", {
        height: grown,
        width: grown,
        x: grown.map((side) => -side / 2),
        y: grown.map((side) => -side / 2),
      }, `rx="${formatNumber(Math.min(radius, size / 4))}" fill="var(--accent-soft)" class="ln-base" stroke="var(--accent)"`)}
    </g>`;
  const pointer = cursor(clock, track("pointer"), CLICKS);

  return {
    content: `
    <defs>${dots}</defs>
    ${layoutMetadata(scene.format, { canvas })}
    <rect ${rectAttrs(canvas)} rx="${formatNumber(radius)}" data-fill="canvas" class="ln-hair" fill="var(--surface)" stroke="var(--border)" />
    <rect ${rectAttrs(canvas)} rx="${formatNumber(radius)}" fill="url(#canvas-grid)" opacity=".7" class="lod-texture" />
    <g data-drag="">
    <g opacity="0">${timeline.animate("opacity", guides)}
      <line x1="${formatNumber(target.x)}" y1="${formatNumber(target.y - span)}" x2="${formatNumber(target.x)}" y2="${formatNumber(target.y + span)}" class="ln-hair" stroke="var(--accent)" />
      <line x1="${formatNumber(target.x - span)}" y1="${formatNumber(target.y)}" x2="${formatNumber(target.x + span)}" y2="${formatNumber(target.y)}" class="ln-hair" stroke="var(--accent)" />
    </g>
    ${shapeMarkup}
    </g>
    ${pointer}`,
    model: { frame, keys: KEYS, regions: { canvas } },
    referenceWidth: frame.referenceWidth,
    viewBox: { height: frame.height, width: frame.width },
  };
}

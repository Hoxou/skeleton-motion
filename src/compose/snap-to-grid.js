import { frameFor } from "../layout/formats.js";
import { cursor } from "../render-svg.js";
import { center, curveOver, layoutMetadata, lerp, sourceUnits } from "./kit.js";
import { createTimeline, formatNumber } from "./tracks.js";

// Source proportions (source px): a layout canvas with its own dotted grid
// and one shape dragged into place. The canvas is the container; the shape
// keeps its size, and the grid pitch follows the shared type scale.
const GRID = 24;
const SHAPE = 84;
const GUIDE = 120;

const KEYS = Object.freeze([
  { at: 0 }, { at: 0.08 }, { at: 0.2, ease: "smoothMove" }, { at: 0.24, ease: "quick" }, { at: 0.28 },
  { at: 0.38 }, { at: 0.48 }, { at: 0.52 }, { at: 0.6 }, { at: 0.7 }, { at: 0.88 }, { at: 1 },
]);
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
  // One drag segment shared by the shape and the pointer: a keyframe inside it
  // would stall the pointer (every spline eases to zero) while the shape's
  // track drops it, pulling the two apart. Nothing overshoots the cell
  // because snapping is the point of the story.
  const travel = curve([[0, 0], [0.28, 0], [0.48, 1], [0.88, 1], [1, 0]]);
  const positions = travel.map((t) => ({ x: lerp(start.x, target.x, t), y: lerp(start.y, target.y, t) }));
  const lift = curve([[0, 0], [0.24, 0], [0.28, 1], [0.48, 1], [0.52, 0], [1, 0]]);
  const shapeFrames = positions.map((point, key) => {
    const grow = 1 + 0.04 * lift[key];
    return { height: size * grow, width: size * grow, x: point.x - size * grow / 2, y: point.y - size * grow / 2 };
  });
  const guides = curve([[0, 0], [0.3, 0], [0.38, 1], [0.6, 1], [0.7, 0], [1, 0]]);
  const span = Math.min(GUIDE * k, canvas.width / 2 - pitch, canvas.height / 2 - pitch);

  const dots = `<pattern id="canvas-grid" x="${formatNumber(canvas.x)}" y="${formatNumber(canvas.y)}" width="${formatNumber(pitch)}" height="${formatNumber(pitch)}" patternUnits="userSpaceOnUse"><circle cx="${formatNumber(pitch / 2)}" cy="${formatNumber(pitch / 2)}" r="${formatNumber(1.25 * k)}" fill="var(--border-strong)" /></pattern>`;
  const shapeMarkup = timeline.element("rect", {
    height: shapeFrames.map((rect) => rect.height),
    width: shapeFrames.map((rect) => rect.width),
    x: shapeFrames.map((rect) => rect.x),
    y: shapeFrames.map((rect) => rect.y),
  }, `rx="${formatNumber(Math.min(radius, size / 4))}" fill="var(--accent-soft)" class="ln-base" stroke="var(--accent)"`);
  const grab = { x: start.x + size * 0.18, y: start.y + size * 0.18 };
  const dropped = { x: target.x + size * 0.18, y: target.y + size * 0.18 };
  const rest = { x: canvas.x + canvas.width * 0.84, y: canvas.y + canvas.height * 0.84 };
  const pointer = cursor({ ...scene, timing: undefined }, [
    { at: 0, ...rest }, { at: 0.08, ...rest }, { at: 0.22, ...grab }, { at: 0.28, ...grab },
    { at: 0.48, ...dropped },
    { at: 0.88, ...dropped }, { at: 1, ...rest },
  ].map((point) => ({ at: point.at, x: formatNumber(point.x), y: formatNumber(point.y) })), [0.24], [0.06, 0.84, 0.87]);

  return {
    content: `
    <defs>${dots}</defs>
    ${layoutMetadata(scene.format, { canvas })}
    <rect ${rectAttrs(canvas)} rx="${formatNumber(radius)}" data-fill="canvas" class="ln-hair" fill="var(--surface)" stroke="var(--border)" />
    <rect ${rectAttrs(canvas)} rx="${formatNumber(radius)}" fill="url(#canvas-grid)" opacity=".7" class="lod-texture" />
    <g data-drag>
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

// Shared vocabulary for composed stories: one type scale, one stacking rule,
// one backdrop. Sizes are authored in "source px", the pixels of the 720x405
// reference embed (short side 405), so every story and format draws bars,
// avatars, rows, and panels at the same density.

export const ITEM_SCALE_RANGE = Object.freeze([0.85, 1.15]);

export function sourceUnits(frame) {
  return (value) => value / frame.unitPx;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerpRect(a, b, t) {
  return { height: lerp(a.height, b.height, t), width: lerp(a.width, b.width, t), x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function center(rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

// Piecewise-linear lookup over a story's beats, for effects authored as their
// own curve on the shared timeline.
export function curveOver(keys) {
  return (points) => keys.map(({ at }) => {
    const next = points.findIndex(([time]) => time >= at);
    if (next === -1) return points.at(-1)[1];
    if (next === 0) return points[0][1];
    const [t0, v0] = points[next - 1];
    const [t1, v1] = points[next];
    return v0 + (v1 - v0) * (at - t0) / (t1 - t0);
  });
}

// Pointer timing on the same story clock as `createTimeline`: the last key
// maps to the end of the loop.
export function storyClock(keys) {
  return { beats: [[0, 0], [keys.at(-1).at, 1]] };
}

// Lists fill their region the way the product would: items keep their
// natural size and the source gap, and the region takes as many items as fit.
// Leftover space goes into item scale (within `scaleRange`), and only what
// that cannot absorb widens the gap; a few items spread apart reads as an
// empty, unfinished list. `sizeRange` bounds the item by what the other axis
// allows (a column that may not grow wider, for instance). Ties go to the
// fuller list.
export function fillStack({ gap, intrinsic, length, max = 16, min = 1, minGap = gap * 0.5, scaleRange = ITEM_SCALE_RANGE, sizeRange = [0, Infinity] }) {
  let best;
  for (let count = min; count <= max; count += 1) {
    const ideal = length / (intrinsic * (count + (count - 1) * gap));
    const size = Math.min(sizeRange[1], Math.max(sizeRange[0], intrinsic * Math.min(scaleRange[1], Math.max(scaleRange[0], ideal))));
    const actual = count > 1 ? (length - count * size) / ((count - 1) * size) : 0;
    if (count > 1 && actual < minGap) continue;
    const cost = Math.abs(actual - gap) + Math.abs(size / intrinsic - 1);
    if (!best || cost <= best.cost + 1e-9) best = { cost, count, gap: actual, scale: size / intrinsic, size };
  }
  return best;
}

// Fixed positions of a filled stack, including the ones just past either
// edge (index -1, `count`), so a list that grows or shrinks moves items slot
// to slot and lets the one pushed out leave over the edge, instead of
// re-spacing what stays.
export function stackSlots(region, axis, { count, gap, size }) {
  const horizontal = axis === "x";
  const start = (horizontal ? region.x : region.y) + (count > 1 ? 0 : ((horizontal ? region.width : region.height) - size) / 2);
  const pitch = size * (1 + gap);
  return (index) => (horizontal
    ? { height: region.height, width: size, x: start + index * pitch, y: region.y }
    : { height: size, width: region.width, x: region.x, y: start + index * pitch });
}

export function stackRects(region, axis, stack) {
  const slot = stackSlots(region, axis, stack);
  return Array.from({ length: stack.count }, (_, index) => slot(index));
}

export function glyphLines(kind, cx, cy, half) {
  const diagonal = half * 0.86;
  if (kind === "minus") return [[cx - half, cy, cx + half, cy]];
  if (kind === "cross") return [[cx - diagonal, cy - diagonal, cx + diagonal, cy + diagonal], [cx + diagonal, cy - diagonal, cx - diagonal, cy + diagonal]];
  return [[cx - half, cy, cx + half, cy], [cx, cy - half, cx, cy + half]];
}

export function lineTracks(lines) {
  return { x1: lines.map((line) => line[0]), x2: lines.map((line) => line[2]), y1: lines.map((line) => line[1]), y2: lines.map((line) => line[3]) };
}

// One backdrop for every composed story: transparent by default, a texture
// only when the source authored one. Glows are not part of the vocabulary;
// they made sets read as different products side by side.
export function backdrop(scene, frame) {
  if (scene.backdrop !== "dots") return "";
  return `<rect width="${frame.width}" height="${frame.height}" fill="url(#dots)" opacity=".62" class="lod-texture" />`;
}

export function layoutMetadata(format, regions) {
  return `<metadata id="skeleton-layout">${JSON.stringify({ format: format.id, regions })}</metadata>`;
}

// Shared vocabulary for composed stories: one type scale, one stacking rule,
// one backdrop. Sizes are authored in "source px", the pixels of the 720x405
// reference embed (short side 405), so every story and format draws bars,
// avatars, rows, and panels at the same density.

export const ITEM_SCALE_RANGE = Object.freeze([0.85, 1.15]);
// Each extra item must buy a clearly better fit; a small cast reads faster.
const EXTRA_ITEM_COST = 0.25;

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
    if (next <= 0) return points[Math.max(0, next)][1];
    const [t0, v0] = points[next - 1];
    const [t1, v1] = points[next];
    return v0 + (v1 - v0) * (at - t0) / (t1 - t0);
  });
}

// How many items of a given natural height fill `length`, and at what scale.
// The scale stays near 1 so items read at the same size in every asset; the
// remaining slack becomes spacing, measured against the source rhythm.
// `sizeRange` lets the caller bound the item by what the other axis allows
// (a column that may not grow wider, for instance).
export function chooseStack({ counts, idealGap, intrinsic, length, minGap = 0.2, scaleRange = ITEM_SCALE_RANGE, sizeRange = [0, Infinity] }) {
  const options = counts.map((count) => {
    const ideal = length / (intrinsic * (count + (count - 1) * idealGap));
    const size = Math.min(sizeRange[1], Math.max(sizeRange[0], intrinsic * Math.min(scaleRange[1], Math.max(scaleRange[0], ideal))));
    const scale = size / intrinsic;
    const gap = count > 1 ? (length - count * size) / ((count - 1) * size) : 0;
    return { cost: Math.abs(gap - idealGap) + Math.abs(scale - 1) + (count - counts[0]) * EXTRA_ITEM_COST, count, gap, scale, size };
  }).filter(({ gap, scale }) => gap >= minGap && scale >= scaleRange[0] - 1e-9 && scale <= scaleRange[1] + 1e-9);
  return options.reduce((best, option) => (!best || option.cost < best.cost ? option : best), undefined);
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

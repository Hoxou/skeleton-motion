// A minimal flex-style solver whose one job is to keep a region full.
//
// node: { axis: "x" | "y", gap, children } or a leaf { id }.
// Child fields: grow (default 1), basis (default 0), presence (0..1, default
// 1), aspect (width / height, locks the shape like an oval or icon tile),
// max (largest main-axis size it grows to; the rest goes to other growers).

const sum = (values) => values.reduce((total, value) => total + value, 0);
const presenceOf = (item) => item.presence ?? 1;

// A gap only exists between content that is present on both sides, so a
// collapsed trailing item never leaves an empty strip at the region edge.
function gapWeights(items) {
  const presence = items.map(presenceOf);
  return items.slice(0, -1).map((_, index) => Math.min(
    Math.max(...presence.slice(0, index + 1)),
    Math.max(...presence.slice(index + 1)),
  ));
}

function aspectCap(item, cross, horizontal) {
  const max = item.max === undefined ? Infinity : item.max * presenceOf(item);
  if (!item.aspect) return max;
  return Math.min(max, (horizontal ? cross * item.aspect : cross / item.aspect) * presenceOf(item));
}

function distribute(items, available, cross, horizontal) {
  const sizes = items.map(() => 0);
  const fixed = new Set();
  for (let pass = 0; pass <= items.length; pass += 1) {
    const open = items.map((_, index) => index).filter((index) => !fixed.has(index));
    const reserved = sum([...fixed].map((index) => sizes[index]));
    const basis = sum(open.map((index) => (items[index].basis ?? 0) * presenceOf(items[index])));
    const growTotal = sum(open.map((index) => (items[index].grow ?? 1) * presenceOf(items[index])));
    const free = Math.max(0, available - reserved - basis);
    for (const index of open) {
      const item = items[index];
      const weight = (item.grow ?? 1) * presenceOf(item);
      sizes[index] = (item.basis ?? 0) * presenceOf(item) + (growTotal > 0 ? free * weight / growTotal : 0);
    }
    const capped = open.filter((index) => sizes[index] > aspectCap(items[index], cross, horizontal));
    if (capped.length === 0) break;
    for (const index of capped) {
      sizes[index] = aspectCap(items[index], cross, horizontal);
      fixed.add(index);
    }
  }
  return sizes;
}

export function solve(node, rect, out = {}) {
  if (!node.children) {
    out[node.id] = { ...rect };
    return out;
  }
  const horizontal = node.axis === "x";
  const main = horizontal ? "width" : "height";
  const cross = horizontal ? "height" : "width";
  const items = node.children;
  const gaps = gapWeights(items).map((weight) => weight * (node.gap ?? 0));
  const available = rect[main] - sum(gaps);
  const sizes = distribute(items, available, rect[cross], horizontal);
  const leftover = available - sum(sizes);
  // Aspect-locked shapes cannot stretch; their unused space goes into the
  // gaps so the first and last shapes stay pinned to the region edges.
  const openGaps = gaps.filter((gap) => gap > 0).length;
  const spread = leftover > 1e-6 && openGaps > 0
    ? gaps.map((gap) => (gap > 0 ? gap + leftover / openGaps : gap))
    : gaps;
  const lead = leftover > 1e-6 && openGaps === 0 ? leftover / 2 : 0;

  let position = (horizontal ? rect.x : rect.y) + lead;
  items.forEach((item, index) => {
    const size = sizes[index];
    const crossSize = item.aspect
      ? Math.min(rect[cross], horizontal ? size / item.aspect : size * item.aspect)
      : rect[cross];
    const crossStart = (horizontal ? rect.y : rect.x) + (rect[cross] - crossSize) / 2;
    const child = horizontal
      ? { height: crossSize, width: size, x: position, y: crossStart }
      : { height: size, width: crossSize, x: crossStart, y: position };
    solve(item, child, out);
    position += size + (spread[index] ?? 0);
  });
  return out;
}

export function inset(rect, amount) {
  const x = Math.min(amount, rect.width / 2);
  const y = Math.min(amount, rect.height / 2);
  return { height: rect.height - y * 2, width: rect.width - x * 2, x: rect.x + x, y: rect.y + y };
}

export function lerpRect(a, b, t) {
  return {
    height: a.height + (b.height - a.height) * t,
    width: a.width + (b.width - a.width) * t,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

// Items keep their own main-axis size; the first and last are pinned to the
// region edges and the remaining space becomes equal gaps. Cross axis fills.
export function spaceBetween(region, axis, sizes) {
  const horizontal = axis === "x";
  const length = horizontal ? region.width : region.height;
  const gap = sizes.length > 1 ? (length - sizes.reduce((total, size) => total + size, 0)) / (sizes.length - 1) : 0;
  let position = (horizontal ? region.x : region.y) + (sizes.length > 1 ? 0 : (length - sizes[0]) / 2);
  return sizes.map((size) => {
    const rect = horizontal
      ? { height: region.height, width: size, x: position, y: region.y }
      : { height: size, width: region.width, x: region.x, y: position };
    position += size + gap;
    return rect;
  });
}

const VISIBLE = 0.01;

export function isVisible(rect) {
  return rect.width > VISIBLE && rect.height > VISIBLE;
}

export function union(rects) {
  const visible = rects.filter(isVisible);
  if (visible.length === 0) return undefined;
  const x = Math.min(...visible.map((rect) => rect.x));
  const y = Math.min(...visible.map((rect) => rect.y));
  return {
    height: Math.max(...visible.map((rect) => rect.y + rect.height)) - y,
    width: Math.max(...visible.map((rect) => rect.x + rect.width)) - x,
    x,
    y,
  };
}

// Distance from each region edge to the nearest visible content; 0 everywhere
// means the region reads as full.
export function edgeGaps(rects, region) {
  const bounds = union(rects);
  if (!bounds) return { bottom: region.height, left: region.width, right: region.width, top: region.height };
  return {
    bottom: region.y + region.height - (bounds.y + bounds.height),
    left: bounds.x - region.x,
    right: region.x + region.width - (bounds.x + bounds.width),
    top: bounds.y - region.y,
  };
}

export function contains(outer, inner, tolerance = 0.01) {
  return inner.x >= outer.x - tolerance
    && inner.y >= outer.y - tolerance
    && inner.x + inner.width <= outer.x + outer.width + tolerance
    && inner.y + inner.height <= outer.y + outer.height + tolerance;
}

export function overlapArea(a, b) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

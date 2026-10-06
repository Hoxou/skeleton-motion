import { frameFor } from "../layout/formats.js";
import { inset, spaceBetween } from "../layout/solve.js";
import { backdrop, curveOver, layoutMetadata, sourceUnits } from "./kit.js";
import { createTimeline, formatNumber } from "./tracks.js";

// Source proportions (source px): metric tiles have a natural height and
// stretch to share the row; the chart panel is a container that takes the
// rest. The trend line is redrawn for the panel's shape, not stretched.
const TILE = Object.freeze({ height: 88, minWidth: 130 });
const GAP = 16;
const CHART = Object.freeze({ maxAspect: 3.2, minAspect: 1.15, pad: 24 });
// The source chart's cubic segments, normalized to a 0..1 box (y from the top).
const TREND = Object.freeze({ start: [0,0.8915], curves: [[[0.0954,0.6899],[0.1266,0.7907],[0.2137,0.4961]],[[0.2925,0.2326],[0.3776,0.7519],[0.4647,0.4496]],[[0.556,0.1395],[0.6349,0.5659],[0.7199,0.2636]],[[0.7946,0],[0.8776,0.3643],[1,0.155]]] });
// The wave keeps a landscape proportion; taller panels get gridlines around it.
const TREND_MIN_ASPECT = 1.8;
const GRIDLINES = 4;
const FOOTNOTES = [110, 130, 96];

const KEYS = Object.freeze([{ at: 0 }, { at: 0.12 }, { at: 0.22 }, { at: 0.72 }, { at: 0.78 }, { at: 0.82 }, { at: 0.86 }, { at: 1 }]);
const curve = curveOver(KEYS);

function arrange(frame) {
  const px = sourceUnits(frame);
  const { gutter, safe } = frame;
  const tileHeight = px(TILE.height);
  const gap = px(GAP);
  const options = [];
  for (const count of [3, 2]) {
    const width = (safe.width - gap * (count - 1)) / count;
    if (width < px(TILE.minWidth)) continue;
    options.push({ count, stacked: false, tiles: tileHeight });
  }
  options.push({ count: 3, stacked: true, tiles: tileHeight * 3 + gap * 2 });
  // Keep the chart landscape: prefer the first option whose remaining panel
  // reads as a chart, otherwise the one closest to that shape.
  const aspectOf = (option) => safe.width / (safe.height - gutter - option.tiles);
  const fits = options.find((option) => aspectOf(option) >= CHART.minAspect && aspectOf(option) <= CHART.maxAspect);
  return fits || options.reduce((best, option) => (Math.abs(aspectOf(option) - 1.6) < Math.abs(aspectOf(best) - 1.6) ? option : best));
}

function trendPath(area) {
  const point = ([x, y]) => `${formatNumber(area.x + x * area.width)} ${formatNumber(area.y + y * area.height)}`;
  return `M${point(TREND.start)}${TREND.curves.map((segment) => ` C${segment.map(point).join(" ")}`).join("")}`;
}

const rectAttrs = (rect) => `x="${formatNumber(rect.x)}" y="${formatNumber(rect.y)}" width="${formatNumber(rect.width)}" height="${formatNumber(rect.height)}"`;

function tileMarkup(tile, index, k, radius) {
  const local = (x, y, width, height) => ({ height: height * k, width: width * k, x: tile.x + x * k, y: tile.y + (tile.height - TILE.height * k) / 2 + y * k });
  return `<g>
    <rect ${rectAttrs(tile)} rx="${formatNumber(radius)}" data-fill="tiles" class="ln-hair" fill="var(--surface)" stroke="var(--border)" />
    <circle cx="${formatNumber(tile.x + 22 * k)}" cy="${formatNumber(local(0, 24, 0, 0).y)}" r="${formatNumber(8 * k)}" fill="var(--tag-${index + 1})" />
    <rect ${rectAttrs(local(38, 20.5, 64, 7))} rx="${formatNumber(3.5 * k)}" fill="var(--ink)" opacity=".12" />
    <rect ${rectAttrs(local(18, 40, 80, 18))} rx="${formatNumber(4 * k)}" fill="var(--ink)" opacity=".16" />
    <rect class="lod-fine" ${rectAttrs(local(18, 70, Math.min(FOOTNOTES[index % 3], tile.width / k - 36), 5))} rx="${formatNumber(2.5 * k)}" fill="var(--ink)" opacity=".07" />
  </g>`;
}

export function composeProgressSignal(scene) {
  const frame = frameFor(scene.format);
  const px = sourceUnits(frame);
  const k = px(1);
  const { gutter, safe } = frame;
  const layout = arrange(frame);
  const radius = Math.max(0, (scene.palette.radius ?? 0) / frame.unitPx);
  const timeline = createTimeline(KEYS, scene.duration);
  const tileRegion = { height: layout.tiles, width: safe.width, x: safe.x, y: safe.y };
  const tileHeight = px(TILE.height);
  const tiles = layout.stacked
    ? spaceBetween(tileRegion, "y", Array(layout.count).fill(tileHeight))
    : spaceBetween(tileRegion, "x", Array(layout.count).fill((safe.width - px(GAP) * (layout.count - 1)) / layout.count));
  const panel = { height: safe.height - gutter - layout.tiles, width: safe.width, x: safe.x, y: safe.y + layout.tiles + gutter };
  const plot = inset(panel, CHART.pad * k);
  const baseline = plot.y + plot.height;
  const waveHeight = Math.min(plot.height - 14 * k, plot.width / TREND_MIN_ASPECT);
  const area = { height: waveHeight, width: plot.width, x: plot.x, y: baseline - 14 * k - waveHeight };
  const d = trendPath(area);
  const gridlines = Array.from({ length: GRIDLINES }, (_, index) => plot.y + (baseline - plot.y) * index / GRIDLINES)
    .map((y) => `<line x1="${formatNumber(plot.x)}" y1="${formatNumber(y)}" x2="${formatNumber(plot.x + plot.width)}" y2="${formatNumber(y)}" class="ln-hair lod-fine" stroke="var(--border)" stroke-opacity=".6" />`).join("");

  const trace = timeline.element("path", { opacity: curve([[0, 0], [0.12, 0], [0.22, 0.82], [0.86, 0.82], [1, 0]]) }, `d="${d}" fill="none" class="ln-heavy" stroke="var(--accent)"`);
  const marker = `<circle r="${formatNumber(6 * k)}" fill="var(--accent)" opacity="0">
    <animateMotion path="${d}" keyTimes="0;.12;.72;1" keyPoints="0;0;1;1" calcMode="linear" dur="${scene.duration}s" repeatCount="indefinite" />
    ${timeline.animate("opacity", curve([[0, 0], [0.12, 1], [0.82, 1], [1, 0]]))}
  </circle>`;

  const regions = { chart: panel, tiles: tileRegion };
  return {
    content: `
    ${layoutMetadata(scene.format, regions)}
    ${backdrop(scene, frame)}
    ${tiles.map((tile, index) => tileMarkup(tile, index, k, radius)).join("")}
    <rect ${rectAttrs(panel)} rx="${formatNumber(radius)}" data-fill="chart" class="ln-hair" fill="var(--surface)" stroke="var(--border)" />
    ${gridlines}
    <line x1="${formatNumber(plot.x)}" y1="${formatNumber(baseline)}" x2="${formatNumber(plot.x + plot.width)}" y2="${formatNumber(baseline)}" class="ln-hair" stroke="var(--border)" />
    <path d="${d}" fill="none" class="ln-heavy" stroke="var(--border-strong)" />
    ${trace}
    ${marker}`,
    model: { frame, keys: KEYS, layout, regions },
    referenceWidth: frame.referenceWidth,
    viewBox: { height: frame.height, width: frame.width },
  };
}

export const __testing = { arrange };

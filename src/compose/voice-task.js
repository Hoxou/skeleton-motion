import { frameFor } from "../layout/formats.js";
import { backdrop, center, curveOver, fillStack, layoutMetadata, lerpRect, sourceUnits, stackRects } from "./kit.js";
import { createTimeline, formatNumber, rectTracks } from "./tracks.js";

// Source proportions (source px) from the voice-first task list: list rows
// have a natural height and stretch to the list width; the voice control is a
// container whose parts keep their size and re-flow to its shape.
const ROW_HEIGHT = 64;
const ROW_GAP = 33 / ROW_HEIGHT;
const ROW_MIN_WIDTH = 348;
// The spoken task swaps with the one above it, so a list shows at least three.
const ROW_COUNTS = Object.freeze({ max: 16, min: 3 });
const PANEL = Object.freeze({ footer: 50, pad: 16, tile: { height: 84, width: 146 }, width: 178 });
const PANEL_MIN = Object.freeze({ tallHeight: 210, tallWidth: 178, wideHeight: 80, wideWidth: 300 });
const SHARE_RANGE = [0.38, 0.72];
const TITLE_WIDTHS = [142, 176, 118, 160];
const DETAIL_WIDTHS = [220, 196, 252, 180];
const WAVE = Object.freeze({ barWidth: 8, count: 5, pitch: 22 });

// Beats: listen (ambient), the spoken task is recognized and highlighted,
// lifts over the task at the top, the displaced task drops into the freed
// slot, then the change is confirmed. The rewind clears the confirmation and
// plays the swap backwards.
const KEYS = Object.freeze([
  { at: 0 }, { at: 0.36 }, { at: 0.42 }, { at: 0.46 }, { at: 0.48 }, { at: 0.5 },
  { at: 0.56 }, { at: 0.62 }, { at: 0.66, ease: "quick" }, { at: 0.68 }, { at: 0.72 }, { at: 0.76 },
  { at: 0.86 }, { at: 0.88 }, { at: 0.89 }, { at: 0.92 }, { at: 1.02 }, { at: 1.1 }, { at: 1.12 }, { at: 1.16 }, { at: 1.2 },
]);
const curve = curveOver(KEYS);
const WAVE_TIMES = "0;.125;.25;.375;.5;.625;.75;.875;1";

// Lift and drop keeps the top edge covered: the spoken task arrives over the
// top slot before the displaced task leaves it, and the rewind reverses that
// order: the displaced task is home under it before the spoken one drops.
// Anticipation and overshoot only point into the list.
const SPOKEN = curve([[0, 0], [0.48, 0], [0.5, -0.04], [0.62, 1], [1.02, 1], [1.1, -0.03], [1.12, 0]]);
const DISPLACED = curve([[0, 0], [0.62, 0], [0.72, 1.04], [0.76, 1], [0.92, 1], [1.02, 0]]);

function arrange(frame) {
  const px = sourceUnits(frame);
  const { gutter, safe } = frame;
  const intrinsic = px(ROW_HEIGHT);
  const candidates = [];
  const across = safe.width - gutter;
  const panelWidth = Math.max(px(PANEL_MIN.tallWidth), across * (1 - SHARE_RANGE[1]));
  if (across - panelWidth >= px(ROW_MIN_WIDTH)) {
    const stack = fillStack({ ...ROW_COUNTS, gap: ROW_GAP, intrinsic, length: safe.height });
    if (stack) candidates.push({ axis: "columns", ...stack, panel: "tall", rowHeight: stack.size, size: across - panelWidth });
  }
  for (let count = ROW_COUNTS.min; count <= ROW_COUNTS.max; count += 1) {
    const natural = intrinsic * (count + (count - 1) * ROW_GAP);
    const length = Math.min(natural, safe.height - gutter - px(PANEL_MIN.wideHeight));
    const stack = fillStack({ gap: ROW_GAP, intrinsic, length, max: count, min: count });
    const share = length / (safe.height - gutter);
    if (!stack || share < SHARE_RANGE[0] || share > SHARE_RANGE[1]) continue;
    const panelHeight = safe.height - gutter - length;
    const panel = panelHeight >= px(PANEL_MIN.tallHeight) * 1.6 && safe.width < px(PANEL_MIN.wideWidth) * 1.4 ? "tall" : "wide";
    // Stacked frames should read list-first without leaving the control mostly empty.
    candidates.push({ axis: "rows", ...stack, cost: stack.cost + Math.abs(share - 0.58), panel, rowHeight: stack.size, size: length });
  }
  if (candidates.length === 0) throw new Error(`voice-to-task cannot stage ${safe.width}x${safe.height}`);
  return candidates.reduce((best, candidate) => (candidate.cost < best.cost ? candidate : best));
}

function regionsFor(frame, arrangement) {
  const { gutter, safe } = frame;
  if (arrangement.axis === "columns") {
    return {
      list: { height: safe.height, width: arrangement.size, x: safe.x, y: safe.y },
      voice: { height: safe.height, width: safe.width - gutter - arrangement.size, x: safe.x + arrangement.size + gutter, y: safe.y },
    };
  }
  return {
    list: { height: arrangement.size, width: safe.width, x: safe.x, y: safe.y },
    voice: { height: safe.height - gutter - arrangement.size, width: safe.width, x: safe.x, y: safe.y + arrangement.size + gutter },
  };
}

function micPath(cx, cy, k) {
  const n = (value) => formatNumber(value * k);
  return `M${formatNumber(cx)} ${formatNumber(cy - 15 * k)}a${n(8)} ${n(8)} 0 0 0-${n(8)} ${n(8)}v${n(9)}a${n(8)} ${n(8)} 0 0 0 ${n(16)} 0v-${n(9)}a${n(8)} ${n(8)} 0 0 0-${n(8)}-${n(8)}Zm-${n(14)} ${n(16)}v${n(2)}a${n(14)} ${n(14)} 0 0 0 ${n(28)} 0v-${n(2)}M${formatNumber(cx)} ${formatNumber(cy + 17 * k)}v${n(9)}`;
}

// The voice control re-flows to its region: stacked (tile, waveform, footer)
// when docked beside the list, side by side (tile, waveform) as a strip.
function voicePanel(region, k, variant, duration, radius) {
  const pad = PANEL.pad * k;
  const tile = variant === "tall"
    ? { height: PANEL.tile.height * k, width: region.width - pad * 2, x: region.x + pad, y: region.y + pad }
    : { height: region.height - pad * 2, width: Math.min(PANEL.tile.width * k, region.width * 0.42), x: region.x + pad, y: region.y + pad };
  const mic = center(tile);
  const ringRadius = 25 * Math.min(k, tile.height / (2 * 38));
  const micScale = ringRadius / 25;
  const footerTop = region.y + region.height - PANEL.footer * k;
  const waveCenter = variant === "tall"
    ? { x: region.x + region.width / 2, y: (tile.y + tile.height + footerTop) / 2 }
    : { x: (tile.x + tile.width + region.x + region.width) / 2, y: region.y + region.height / 2 };
  const waveScale = Math.min(k, (variant === "tall" ? footerTop - tile.y - tile.height : region.height - pad * 2) / 54);
  const bars = Array.from({ length: WAVE.count }, (_, index) => {
    const x = waveCenter.x + (index - (WAVE.count - 1) / 2) * WAVE.pitch * waveScale - WAVE.barWidth * waveScale / 2;
    const heights = Array.from({ length: 8 }, (_, step) => (8 + ((index * 13 + step * 17) % 42)) * waveScale);
    heights.push(heights[0]);
    const ys = heights.map((height) => waveCenter.y - height / 2);
    const list = (values) => values.map((value) => formatNumber(value)).join(";");
    return `<rect x="${formatNumber(x)}" y="${formatNumber(ys[0])}" width="${formatNumber(WAVE.barWidth * waveScale)}" height="${formatNumber(heights[0])}" rx="${formatNumber(WAVE.barWidth * waveScale / 2)}" fill="var(--accent)" opacity=".82">
      <animate attributeName="y" values="${list(ys)}" keyTimes="${WAVE_TIMES}" dur="${duration}s" repeatCount="indefinite" />
      <animate attributeName="height" values="${list(heights)}" keyTimes="${WAVE_TIMES}" dur="${duration}s" repeatCount="indefinite" />
      <animate attributeName="opacity" values=".58;.92;.7;1;.62;.9;.7;.96;.58" keyTimes="${WAVE_TIMES}" dur="${duration}s" repeatCount="indefinite" />
    </rect>`;
  }).join("");
  const ring = [25, 34, 25, 38, 25, 33, 25, 36, 25].map((value) => formatNumber(value * micScale)).join(";");
  const footer = variant === "tall" ? `
    <rect x="${formatNumber(region.x + (region.width - 122 * k) / 2)}" y="${formatNumber(footerTop)}" width="${formatNumber(122 * k)}" height="${formatNumber(7 * k)}" rx="${formatNumber(3.5 * k)}" fill="var(--ink)" opacity=".1" />
    <rect class="lod-fine" x="${formatNumber(region.x + (region.width - 90 * k) / 2)}" y="${formatNumber(footerTop + 19 * k)}" width="${formatNumber(90 * k)}" height="${formatNumber(5 * k)}" rx="${formatNumber(2.5 * k)}" fill="var(--ink)" opacity=".06" />` : "";
  return `<g id="voice-control">
    <rect x="${formatNumber(region.x)}" y="${formatNumber(region.y)}" width="${formatNumber(region.width)}" height="${formatNumber(region.height)}" rx="${formatNumber(radius)}" data-fill="voice" class="ln-hair" fill="var(--surface)" stroke="var(--border)" />
    <rect x="${formatNumber(tile.x)}" y="${formatNumber(tile.y)}" width="${formatNumber(tile.width)}" height="${formatNumber(tile.height)}" rx="${formatNumber(radius)}" fill="var(--tag-4)" opacity=".72" />
    <circle cx="${formatNumber(mic.x)}" cy="${formatNumber(mic.y)}" r="${formatNumber(ringRadius)}" fill="var(--tag-1)" />
    <path class="ln-strong" d="${micPath(mic.x, mic.y, micScale)}" fill="none" stroke="var(--accent)" stroke-linecap="round" />
    <circle class="ln-base" cx="${formatNumber(mic.x)}" cy="${formatNumber(mic.y)}" r="${formatNumber(ringRadius)}" fill="none" stroke="var(--accent)" opacity="0">
      <animate attributeName="r" values="${ring}" keyTimes="${WAVE_TIMES}" dur="${duration}s" repeatCount="indefinite" />
      <animate attributeName="opacity" values=".08;.5;.08;.56;.08;.42;.08;.5;.08" keyTimes="${WAVE_TIMES}" dur="${duration}s" repeatCount="indefinite" />
    </circle>
    <g id="voice-waveform">${bars}</g>${footer}
  </g>`;
}

function taskRow(timeline, frames, index, k, spoken, radius) {
  const tracks = rectTracks(frames);
  const at = (x, y) => ({ x: frames.map((rect) => rect.x + x * k), y: frames.map((rect) => rect.y + (rect.height - ROW_HEIGHT * k) / 2 + y * k) });
  const fromRight = (x, y) => ({ x: frames.map((rect) => rect.x + rect.width - x * k), y: at(0, y).y });
  const avatar = at(32, 32);
  const title = at(60, 21);
  const detail = at(60, 36);
  const pill = fromRight(92, 19);
  const shape = (point, width, height) => ({ height: frames.map(() => height * k), width: frames.map(() => width * k), x: point.x, y: point.y });
  const pillRect = shape(pill, 66, 26);
  const highlight = spoken ? timeline.element("rect", { ...tracks, opacity: curve([[0, 0], [0.42, 0], [0.5, 0.08], [0.62, 0.3], [0.72, 0.18], [1.12, 0.18], [1.16, 0]]) }, `rx="${formatNumber(radius)}" class="ln-hair" fill="var(--accent-soft)" stroke="var(--accent)"`) : "";
  const check = KEYS.map((_, key) => `M${formatNumber(pill.x[key] + 23 * k)} ${formatNumber(pill.y[key] + 13 * k)}l${formatNumber(6 * k)} ${formatNumber(6 * k)} ${formatNumber(12 * k)}-${formatNumber(13 * k)}`);
  const confirm = spoken ? `${timeline.element("rect", { ...pillRect, opacity: curve([[0, 0], [0.56, 0], [0.66, 1], [0.88, 1], [0.92, 0]]) }, `rx="${formatNumber(13 * k)}" fill="var(--accent)"`)}
    <path d="${check[0]}" class="ln-strong" fill="none" stroke="var(--surface)" stroke-linecap="round" stroke-linejoin="round" opacity="0">${timeline.animate("opacity", curve([[0, 0], [0.62, 0], [0.68, 1], [0.86, 1], [0.89, 0]]))}${timeline.animateText("d", check)}</path>` : "";
  return `<g${spoken ? ` id="voice-updated-task"` : ""}>
    ${timeline.element("rect", tracks, `rx="${formatNumber(radius)}" data-fill="list" class="ln-hair" fill="var(--surface)" stroke="var(--border)"`)}
    ${highlight}
    ${timeline.element("circle", { cx: avatar.x, cy: avatar.y }, `r="${formatNumber(12 * k)}" fill="var(--tag-${(index % 4) + 1})"`)}
    ${timeline.element("circle", { cx: avatar.x, cy: avatar.y }, `r="${formatNumber(4 * k)}" fill="var(--accent-${(index % 4) + 1})" opacity=".78"`)}
    ${timeline.element("rect", shape(title, TITLE_WIDTHS[index % 4], 7), `rx="${formatNumber(3.5 * k)}" fill="var(--ink)" opacity=".18"`)}
    ${timeline.element("rect", shape(detail, DETAIL_WIDTHS[index % 4], 5), `class="lod-fine" rx="${formatNumber(2.5 * k)}" fill="var(--ink)" opacity=".08"`)}
    ${timeline.element("rect", pillRect, `rx="${formatNumber(13 * k)}" fill="var(--tag-${(index % 4) + 1})"`)}
    ${confirm}
  </g>`;
}

export function composeVoiceTask(scene) {
  const frame = frameFor(scene.format);
  const px = sourceUnits(frame);
  const arrangement = arrange(frame);
  const regions = regionsFor(frame, arrangement);
  const k = px(1) * arrangement.scale;
  const radius = Math.max(0, (scene.palette.radius ?? 0) / frame.unitPx);
  const timeline = createTimeline(KEYS, scene.duration);
  const slots = stackRects(regions.list, "y", { count: arrangement.count, gap: arrangement.gap, size: arrangement.rowHeight });
  const layers = {};
  const rows = slots.map((slot, index) => {
    let frames = KEYS.map(() => slot);
    if (index === 0) frames = DISPLACED.map((q) => lerpRect(slots[0], slots[1], q));
    if (index === 1) frames = SPOKEN.map((q) => lerpRect(slots[1], slots[0], q));
    layers[`row-${index}`] = { frames, region: "list", role: "fill" };
    return { index, markup: taskRow(timeline, frames, index, k, index === 1, radius) };
  });
  // The moving rows are drawn last so the spoken task passes over its neighbour.
  const ordered = [...rows.filter(({ index }) => index > 1), rows[0], rows[1]].map(({ markup }) => markup).join("");

  const spoken = layers["row-1"].frames;
  const connector = arrangement.axis === "columns"
    ? timeline.element("line", {
      opacity: curve([[0, 0], [0.36, 0.16], [0.46, 0.72], [0.68, 0.72], [0.86, 0.2], [1.12, 0.2], [1.16, 0]]),
      y1: spoken.map((rect) => rect.y + rect.height / 2),
      y2: spoken.map((rect) => rect.y + rect.height / 2),
    }, `x1="${formatNumber(regions.list.x + regions.list.width)}" x2="${formatNumber(regions.voice.x)}" class="ln-base" stroke="var(--accent)"`)
    : "";
  layers.voice = { frames: KEYS.map(() => regions.voice), region: "voice", role: "fill" };

  return {
    content: `
    ${layoutMetadata(scene.format, regions)}
    ${backdrop(scene, frame)}
    ${connector}
    ${ordered}
    ${voicePanel(regions.voice, k, arrangement.panel, scene.duration, radius)}`,
    model: { arrangement, frame, keys: KEYS, layers, regions },
    referenceWidth: frame.referenceWidth,
    viewBox: { height: frame.height, width: frame.width },
  };
}

export const __testing = { KEYS, arrange };

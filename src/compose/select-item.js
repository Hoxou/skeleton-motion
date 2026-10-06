import { frameFor } from "../layout/formats.js";
import { inset, spaceBetween } from "../layout/solve.js";
import { cursor } from "../render-svg.js";
import { backdrop, chooseStack, curveOver, layoutMetadata, lerp, lerpRect, sourceUnits } from "./kit.js";
import { createTimeline, formatNumber, rectTracks } from "./tracks.js";

// Source proportions (source px) for a list/detail view. Rows have a natural
// height and stretch to the list; both panels are containers.
const LIST = Object.freeze({ gap: 12, minWidth: 200, pad: 16, search: 30, share: 0.34 });
const ROW = Object.freeze({ gap: 14 / 52, height: 52 });
const DETAIL = Object.freeze({ bodyRow: 14, bodyRowGap: 10, button: { height: 26, width: 72 }, header: 56, minWidth: 200, pad: 24 });
const TITLES = [118, 96, 132, 104];
const DETAILS = [74, 90, 60, 82];
const SELECTED = 1;

// The pointer travels only while the UI is still: it hovers the row, clicks,
// waits for the detail to settle, then presses the button.
const KEYS = Object.freeze([
  { at: 0 }, { at: 0.26 }, { at: 0.29 }, { at: 0.31, ease: "quick" }, { at: 0.32 }, { at: 0.33, ease: "quick" },
  { at: 0.34 }, { at: 0.36 }, { at: 0.37 }, { at: 0.39 }, { at: 0.4 }, { at: 0.41 }, { at: 0.43 }, { at: 0.45 },
  { at: 0.47 }, { at: 0.49 }, { at: 0.51 }, { at: 0.66 }, { at: 0.67, ease: "quick" }, { at: 0.7, ease: "quick" },
  { at: 0.74 }, { at: 0.87 }, { at: 0.88 }, { at: 0.9 }, { at: 0.98 }, { at: 1 },
]);
const curve = curveOver(KEYS);
const CLICKS = Object.freeze([0.31, 0.67]);

function arrange(frame) {
  const px = sourceUnits(frame);
  const { gutter, safe } = frame;
  const across = safe.width - gutter;
  const listWidth = Math.max(px(LIST.minWidth), across * LIST.share);
  if (across - listWidth >= px(DETAIL.minWidth)) return { axis: "split", listWidth };
  return { axis: "stack" };
}

function listLayout(panel, k) {
  const pad = LIST.pad * k;
  const search = { height: LIST.search * k, width: panel.width - pad * 2, x: panel.x + pad, y: panel.y + pad };
  const area = { height: panel.y + panel.height - pad - (search.y + search.height + LIST.gap * k), width: search.width, x: search.x, y: search.y + search.height + LIST.gap * k };
  const stack = chooseStack({ counts: [4, 3], idealGap: ROW.gap, intrinsic: ROW.height * k, length: area.height, scaleRange: [0.85, 1.3] })
    || chooseStack({ counts: [3], idealGap: ROW.gap, intrinsic: ROW.height * k, length: area.height, minGap: 0.05, scaleRange: [0.6, 1.3] });
  return { area, rows: spaceBetween(area, "y", Array(stack.count).fill(stack.size)), search };
}

function detailLayout(panel, k) {
  const pad = DETAIL.pad * k;
  const button = { height: DETAIL.button.height * k, width: DETAIL.button.width * k, x: panel.x + panel.width - pad - DETAIL.button.width * k, y: panel.y + panel.height - pad - DETAIL.button.height * k };
  const body = { height: button.y - 16 * k - (panel.y + pad + DETAIL.header * k), width: panel.width - pad * 2, x: panel.x + pad, y: panel.y + pad + DETAIL.header * k };
  const inner = inset(body, 16 * k);
  const rowsTop = inner.y + 22 * k;
  const count = Math.max(1, Math.min(4, Math.floor((inner.y + inner.height - rowsTop + DETAIL.bodyRowGap * k) / ((DETAIL.bodyRow + DETAIL.bodyRowGap) * k))));
  const rows = spaceBetween({ height: inner.y + inner.height - rowsTop, width: inner.width, x: inner.x, y: rowsTop }, "y", Array(count).fill(DETAIL.bodyRow * k));
  return {
    avatar: { cx: panel.x + pad + 16 * k, cy: panel.y + pad + 16 * k, r: 16 * k },
    body,
    bodyTitle: { height: 8 * k, width: Math.min(120 * k, inner.width), x: inner.x, y: inner.y },
    button,
    meta: { height: 6 * k, width: 100 * k, x: panel.x + pad + 44 * k, y: panel.y + pad + 22 * k },
    rows,
    title: { height: 10 * k, width: 150 * k, x: panel.x + pad + 44 * k, y: panel.y + pad + 6 * k },
  };
}

const rectAttrs = (rect) => `x="${formatNumber(rect.x)}" y="${formatNumber(rect.y)}" width="${formatNumber(rect.width)}" height="${formatNumber(rect.height)}"`;

function rowMarkup(row, index, k, timeline, radius, selectedOpacity) {
  const local = (x, y, width, height) => ({ height: height * k, width: width * k, x: row.x + x * k, y: row.y + (row.height - ROW.height * k) / 2 + y * k });
  const title = local(42, 19, TITLES[index % 4], 7);
  const detail = local(42, 31, DETAILS[index % 4], 5);
  const highlight = selectedOpacity ? timeline.element("rect", { opacity: selectedOpacity }, `${rectAttrs(row)} rx="${formatNumber(radius)}" fill="var(--accent-soft)" class="ln-hair" stroke="var(--accent)" stroke-opacity=".5"`) : "";
  return `<g${index === SELECTED ? ` id="selected-row"` : ""}>
    <rect ${rectAttrs(row)} rx="${formatNumber(radius)}" data-fill="rows" fill="var(--surface)" />
    ${highlight}
    <circle cx="${formatNumber(row.x + 22 * k)}" cy="${formatNumber(row.y + row.height / 2)}" r="${formatNumber(10 * k)}" fill="var(--tag-${(index % 4) + 1})" />
    <rect ${rectAttrs(title)} rx="${formatNumber(3.5 * k)}" fill="var(--ink)" opacity=".2" />
    <rect class="lod-fine" ${rectAttrs(detail)} rx="${formatNumber(2.5 * k)}" fill="var(--ink)" opacity=".1" />
  </g>`;
}

// Detail content for one item; `variant` shifts bar lengths so a different
// item visibly replaces the previous one.
function detailContent(layout, k, radius, tag, variant) {
  const rows = layout.rows.map((row, index) => `<rect ${rectAttrs({ ...row, width: row.width * (index === layout.rows.length - 1 ? 0.62 - variant * 0.1 : 1 - ((index + variant) % 3) * 0.08) })} rx="${formatNumber(Math.min(radius, row.height / 2))}" fill="var(--surface)" opacity=".7" />`).join("");
  return `<circle cx="${formatNumber(layout.avatar.cx)}" cy="${formatNumber(layout.avatar.cy)}" r="${formatNumber(layout.avatar.r)}" fill="var(--tag-${tag})" />
    <rect ${rectAttrs({ ...layout.title, width: layout.title.width * (1 - variant * 0.18) })} rx="${formatNumber(5 * k)}" fill="var(--ink)" opacity=".18" />
    <rect class="lod-fine" ${rectAttrs({ ...layout.meta, width: layout.meta.width * (1 + variant * 0.2) })} rx="${formatNumber(3 * k)}" fill="var(--ink)" opacity=".08" />
    <rect ${rectAttrs(layout.body)} rx="${formatNumber(radius)}" fill="var(--tag-${tag})" opacity=".55" />
    <rect ${rectAttrs({ ...layout.bodyTitle, width: layout.bodyTitle.width * (1 - variant * 0.2) })} rx="${formatNumber(4 * k)}" fill="var(--ink)" opacity=".12" />
    ${rows}`;
}

function button(timeline, layout, k) {
  const scale = curve([[0, 1], [0.66, 1], [0.67, 0.94], [0.7, 1.02], [0.74, 1], [1, 1]]);
  const frames = scale.map((value) => ({
    height: layout.button.height * value,
    width: layout.button.width * value,
    x: layout.button.x + layout.button.width * (1 - value) / 2,
    y: layout.button.y + layout.button.height * (1 - value) / 2,
  }));
  return timeline.element("rect", { ...rectTracks(frames), opacity: curve([[0, 0], [0.41, 0], [0.49, 1], [0.9, 1], [1, 0]]) }, `rx="${formatNumber(13 * k)}" fill="var(--accent)"`);
}

export function composeSelectItem(scene) {
  const frame = frameFor(scene.format);
  const px = sourceUnits(frame);
  const k = px(1);
  const arrangement = arrange(frame);
  const { gutter, safe } = frame;
  const radius = Math.max(0, (scene.palette.radius ?? 0) / frame.unitPx);
  const timeline = createTimeline(KEYS, scene.duration);
  const split = arrangement.axis === "split";
  const listPanel = split ? { height: safe.height, width: arrangement.listWidth, x: safe.x, y: safe.y } : { ...safe };
  const list = listLayout(listPanel, k);
  const selectedRow = list.rows[SELECTED];
  const layers = { list: { frames: KEYS.map(() => listPanel), region: "list", role: "fill" } };

  const rows = list.rows.map((row, index) => rowMarkup(row, index, k, timeline, radius, index === SELECTED
    ? curve([[0, 0], [0.26, 0], [0.29, 0.3], [0.31, 0.3], [0.4, 1], [0.9, 1], [1, 0]])
    : index === 0 && split ? curve([[0, 1], [0.31, 1], [0.4, 0], [0.9, 0], [1, 1]]) : undefined)).join("");
  const listMarkup = `<g id="item-list">
    <rect ${rectAttrs(listPanel)} rx="${formatNumber(radius)}" data-fill="list" class="ln-hair" fill="var(--surface)" stroke="var(--border)" />
    <rect ${rectAttrs(list.search)} rx="${formatNumber(radius)}" fill="var(--muted)" />
    <circle cx="${formatNumber(list.search.x + 20 * k)}" cy="${formatNumber(list.search.y + list.search.height / 2)}" r="${formatNumber(5 * k)}" fill="var(--ink)" opacity=".15" />
    <rect x="${formatNumber(list.search.x + 34 * k)}" y="${formatNumber(list.search.y + list.search.height / 2 - 3 * k)}" width="${formatNumber(72 * k)}" height="${formatNumber(6 * k)}" rx="${formatNumber(3 * k)}" fill="var(--ink)" opacity=".12" />
    ${rows}
  </g>`;

  let detailMarkup;
  let buttonRect;
  if (split) {
    const panel = { height: safe.height, width: safe.width - gutter - arrangement.listWidth, x: safe.x + arrangement.listWidth + gutter, y: safe.y };
    const layout = detailLayout(panel, k);
    buttonRect = layout.button;
    layers.detail = { frames: KEYS.map(() => panel), region: "detail", role: "fill" };
    // Shared element: the picked row's avatar and title travel into the
    // detail header, so the new content reads as caused by the selection.
    const travel = curve([[0, 0], [0.33, 0], [0.45, 1], [1, 1]]);
    const travelOpacity = curve([[0, 0], [0.32, 0], [0.34, 1], [0.45, 1], [0.47, 0], [1, 0]]);
    const fromAvatar = { cx: selectedRow.x + 22 * k, cy: selectedRow.y + selectedRow.height / 2, r: 10 * k };
    const fromTitle = { height: 7 * k, width: TITLES[SELECTED] * k, x: selectedRow.x + 42 * k, y: selectedRow.y + (selectedRow.height - ROW.height * k) / 2 + 19 * k };
    const traveller = `<g opacity="0">${timeline.animate("opacity", travelOpacity)}
      ${timeline.element("circle", { cx: travel.map((t) => lerp(fromAvatar.cx, layout.avatar.cx, t)), cy: travel.map((t) => lerp(fromAvatar.cy, layout.avatar.cy, t)), r: travel.map((t) => lerp(fromAvatar.r, layout.avatar.r, t)) }, `fill="var(--tag-${SELECTED + 1})"`)}
      ${timeline.element("rect", { ...rectTracks(travel.map((t) => lerpRect(fromTitle, layout.title, t))), rx: travel.map((t) => lerp(3.5, 5, t) * k) }, `fill="var(--ink)" opacity=".2"`)}
    </g>`;
    const previous = curve([[0, 1], [0.33, 1], [0.39, 0], [0.9, 0], [1, 1]]);
    const next = curve([[0, 0], [0.43, 0], [0.49, 1], [0.9, 1], [1, 0]]);
    detailMarkup = `<g id="item-detail">
      <rect ${rectAttrs(panel)} rx="${formatNumber(radius)}" data-fill="detail" class="ln-hair" fill="var(--surface)" stroke="var(--border)" />
      <g>${timeline.animate("opacity", previous)}${detailContent(layout, k, radius, 1, 0)}</g>
      <g opacity="0">${timeline.animate("opacity", next)}${detailContent(layout, k, radius, SELECTED + 1, 1)}</g>
      ${button(timeline, layout, k)}
    </g>${traveller}`;
  } else {
    // Narrow frames navigate instead: the picked row expands into the
    // detail view and collapses back, all inside the list's own rectangle.
    const layout = detailLayout(listPanel, k);
    buttonRect = layout.button;
    const open = curve([[0, 0], [0.37, 0], [0.47, 1], [0.88, 1], [0.98, 0], [1, 0]]);
    const frames = open.map((t) => lerpRect(selectedRow, listPanel, t));
    layers.detail = { frames, opacity: curve([[0, 0], [0.37, 0], [0.4, 1], [0.98, 1], [1, 0]]), region: "list", role: "overlay" };
    detailMarkup = `<g id="item-detail" opacity="0">${timeline.animate("opacity", layers.detail.opacity)}
      ${timeline.element("rect", rectTracks(frames), `rx="${formatNumber(radius)}" class="ln-hair" fill="var(--surface)" stroke="var(--border)"`)}
      <g opacity="0">${timeline.animate("opacity", curve([[0, 0], [0.43, 0], [0.51, 1], [0.87, 1], [0.9, 0], [1, 0]]))}${detailContent(layout, k, radius, SELECTED + 1, 1)}</g>
      ${button(timeline, layout, k)}
    </g>`;
  }

  const rowPoint = { x: selectedRow.x + selectedRow.width * 0.6, y: selectedRow.y + selectedRow.height / 2 };
  const buttonPoint = { x: buttonRect.x + buttonRect.width * 0.4, y: buttonRect.y + buttonRect.height / 2 };
  const rest = { x: safe.x + safe.width - 70 * k * 0.6, y: safe.y + safe.height - 30 * k };
  const pointer = cursor({ ...scene, timing: undefined }, [
    { at: 0, ...rest }, { at: 0.12, ...rest }, { at: 0.26, ...rowPoint }, { at: 0.53, ...rowPoint },
    { at: 0.65, ...buttonPoint }, { at: 0.87, ...buttonPoint }, { at: 1, ...rest },
  ].map((point) => ({ at: point.at, x: formatNumber(point.x), y: formatNumber(point.y) })), CLICKS, [0.08, 0.84, 0.87]);

  const regions = split ? { detail: layers.detail.frames[0], list: listPanel, rows: list.area } : { list: listPanel, rows: list.area };
  return {
    content: `
    ${layoutMetadata(scene.format, regions)}
    ${backdrop(scene, frame)}
    ${listMarkup}
    ${detailMarkup}
    ${pointer}`,
    model: { arrangement, frame, keys: KEYS, layers, regions, rowCount: list.rows.length },
    referenceWidth: frame.referenceWidth,
    viewBox: { height: frame.height, width: frame.width },
  };
}

export const __testing = { arrange };

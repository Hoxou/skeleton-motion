import { frameFor } from "../layout/formats.js";
import { inset, spaceBetween } from "../layout/solve.js";
import { cursor } from "../render-svg.js";
import { backdrop, center, chooseStack, curveOver, layoutMetadata, lerp, sourceUnits } from "./kit.js";
import { createTimeline, formatNumber, rectTracks } from "./tracks.js";

// Source proportions (source px) for a form with a live preview. Fields have
// a natural height and stretch to the form; both panels are containers.
const FORM = Object.freeze({ header: 34, minWidth: 260, pad: 24, share: 0.62 });
const FIELD = Object.freeze({ gap: 0.4, height: 52 });
const BUTTON = Object.freeze({ height: 26, width: 72 });
const PREVIEW = Object.freeze({ minHeight: 150, minWidth: 180, radius: 40 });
// Form height at source proportions: pad, header, three fields with ideal gaps, button row.
const FORM_NATURAL = FORM.pad * 2 + FORM.header + FIELD.height * (3 + 2 * FIELD.gap) + 20 + BUTTON.height;
const FOCUSED = 1;

// The pointer travels only while the UI is still: it focuses the field, waits
// for the preview to answer, then saves and waits for the confirmation.
const KEYS = Object.freeze([
  { at: 0 }, { at: 0.29 }, { at: 0.34, ease: "quick" }, { at: 0.38, ease: "quick" }, { at: 0.42 }, { at: 0.46 },
  { at: 0.62 }, { at: 0.63, ease: "quick" }, { at: 0.64 }, { at: 0.66, ease: "quick" }, { at: 0.68 }, { at: 0.7 },
  { at: 0.71 }, { at: 0.72 }, { at: 0.92 }, { at: 0.96 }, { at: 1 },
]);
const curve = curveOver(KEYS);

const rectAttrs = (rect) => `x="${formatNumber(rect.x)}" y="${formatNumber(rect.y)}" width="${formatNumber(rect.width)}" height="${formatNumber(rect.height)}"`;

function formLayout(panel, k) {
  const pad = FORM.pad * k;
  const button = { height: BUTTON.height * k, width: BUTTON.width * k, x: panel.x + pad, y: panel.y + panel.height - pad - BUTTON.height * k };
  const area = { height: button.y - 20 * k - (panel.y + pad + FORM.header * k), width: panel.width - pad * 2, x: panel.x + pad, y: panel.y + pad + FORM.header * k };
  const stack = chooseStack({ counts: [3], idealGap: FIELD.gap, intrinsic: FIELD.height * k, length: area.height, minGap: 0.15, scaleRange: [0.8, 1.6] });
  const size = stack?.size ?? Math.min(FIELD.height * k, area.height / 3.5);
  return { area, button, fields: spaceBetween(area, "y", [size, size, size]), title: { height: 10 * k, width: 130 * k, x: panel.x + pad, y: panel.y + pad } };
}

export function composeConfirmEdit(scene) {
  const frame = frameFor(scene.format);
  const k = sourceUnits(frame)(1);
  const { gutter, safe } = frame;
  const radius = Math.max(0, (scene.palette.radius ?? 0) / frame.unitPx);
  const timeline = createTimeline(KEYS, scene.duration);
  const formWidth = Math.max(FORM.minWidth * k, (safe.width - gutter) * FORM.share);
  const beside = safe.width - gutter - formWidth >= PREVIEW.minWidth * k;
  const below = !beside && safe.height - gutter - FORM_NATURAL * k >= PREVIEW.minHeight * k;
  const split = beside || below;
  const formPanel = beside ? { height: safe.height, width: formWidth, x: safe.x, y: safe.y }
    : below ? { height: FORM_NATURAL * k, width: safe.width, x: safe.x, y: safe.y } : { ...safe };
  const form = formLayout(formPanel, k);

  const fields = form.fields.map((field, index) => {
    const local = (x, y, width, height) => ({ height: height * k, width: Math.min(width * k, field.width - 32 * k), x: field.x + x * k, y: field.y + y * k });
    const focus = index === FOCUSED
      ? timeline.element("rect", { opacity: curve([[0, 0], [0.29, 0], [0.34, 1], [0.92, 1], [1, 0]]) }, `${rectAttrs(field)} rx="${formatNumber(radius)}" fill="none" class="ln-base" stroke="var(--accent)"`)
      : "";
    return `<g${index === FOCUSED ? ` id="focused-field"` : ""}>
      <rect ${rectAttrs(field)} rx="${formatNumber(radius)}" data-fill="fields" fill="var(--tag-${index + 1})" opacity=".55" />
      <rect ${rectAttrs(local(16, 14, 80 + index * 18, 6))} rx="${formatNumber(3 * k)}" fill="var(--ink)" opacity=".12" />
      <rect class="lod-fine" ${rectAttrs(local(16, 28, 150 - index * 16, 5))} rx="${formatNumber(2.5 * k)}" fill="var(--ink)" opacity=".07" />
      ${focus}
    </g>`;
  }).join("");

  const press = curve([[0, 1], [0.62, 1], [0.63, 0.94], [0.66, 1.02], [0.7, 1], [1, 1]]);
  // Narrow frames have no room for a preview, so the save button itself
  // becomes the confirmation: it narrows into a check pill and back.
  const morph = split ? KEYS.map(() => 0) : curve([[0, 0], [0.63, 0], [0.71, 1], [0.92, 1], [1, 0]]);
  const buttonFrames = KEYS.map((_, key) => {
    const width = lerp(form.button.width, form.button.height * 1.4, morph[key]) * press[key];
    const height = form.button.height * press[key];
    return { height, width, x: form.button.x + (form.button.width - width) / 2 * (1 - morph[key]) + (form.button.width * (1 - press[key])) / 2 * morph[key], y: form.button.y + (form.button.height - height) / 2 };
  });
  const checkAt = (key, scale) => {
    const middle = center(buttonFrames[key]);
    return `M${formatNumber(middle.x - 6 * scale)} ${formatNumber(middle.y)}l${formatNumber(4 * scale)} ${formatNumber(4 * scale)} ${formatNumber(8 * scale)}-${formatNumber(9 * scale)}`;
  };
  const buttonMarkup = `<g id="save">
    ${timeline.element("rect", rectTracks(buttonFrames), `rx="${formatNumber(13 * k)}" fill="var(--accent)"`)}
    ${split ? "" : `<path d="${checkAt(0, k)}" class="ln-strong" fill="none" stroke="var(--surface)" stroke-linecap="round" stroke-linejoin="round" opacity="0">${timeline.animate("opacity", curve([[0, 0], [0.68, 0], [0.72, 1], [0.92, 1], [0.96, 0], [1, 0]]))}${timeline.animateText("d", KEYS.map((_, key) => checkAt(key, k)))}</path>`}
  </g>`;

  let preview = "";
  const regions = { form: formPanel };
  if (split) {
    const panel = beside
      ? { height: safe.height, width: safe.width - gutter - formWidth, x: safe.x + formWidth + gutter, y: safe.y }
      : { height: safe.height - gutter - formPanel.height, width: safe.width, x: safe.x, y: safe.y + formPanel.height + gutter };
    regions.preview = panel;
    const inner = inset(panel, FORM.pad * k);
    const circleRadius = Math.min(PREVIEW.radius * k * 1.3, inner.width * 0.32, inner.height * 0.22);
    const middle = { x: inner.x + inner.width / 2, y: inner.y + inner.height * 0.4 };
    const pulse = curve([[0, 1], [0.34, 1], [0.38, 0.96], [0.42, 1.03], [0.46, 1], [1, 1]]);
    const check = `M${formatNumber(middle.x - circleRadius * 0.48)} ${formatNumber(middle.y)}l${formatNumber(circleRadius * 0.31)} ${formatNumber(circleRadius * 0.31)} ${formatNumber(circleRadius * 0.67)}-${formatNumber(circleRadius * 0.72)}`;
    const lineWidths = [174, 128].map((width) => Math.min(width * k, inner.width * 0.8));
    preview = `<g id="preview">
      <rect ${rectAttrs(panel)} rx="${formatNumber(radius)}" data-fill="preview" class="ln-hair" fill="var(--surface)" stroke="var(--border)" />
      ${timeline.element("circle", { r: pulse.map((value) => circleRadius * value) }, `cx="${formatNumber(middle.x)}" cy="${formatNumber(middle.y)}" fill="var(--tag-2)"`)}
      ${timeline.element("path", { opacity: curve([[0, 0], [0.64, 0], [0.71, 1], [0.92, 1], [1, 0]]) }, `d="${check}" fill="none" class="ln-heavy" stroke="var(--accent)" stroke-linecap="round" stroke-linejoin="round"`)}
      ${lineWidths.map((width, index) => `<rect${index ? ` class="lod-fine"` : ""} x="${formatNumber(middle.x - width / 2)}" y="${formatNumber(middle.y + circleRadius + (24 + index * 16) * k)}" width="${formatNumber(width)}" height="${formatNumber((index ? 5 : 7) * k)}" rx="${formatNumber(3 * k)}" fill="var(--ink)" opacity="${index ? ".08" : ".16"}" />`).join("")}
    </g>`;
  }

  const fieldPoint = { x: form.fields[FOCUSED].x + form.fields[FOCUSED].width * 0.35, y: form.fields[FOCUSED].y + form.fields[FOCUSED].height / 2 };
  const buttonPoint = center(form.button);
  const rest = { x: safe.x + safe.width * 0.84, y: safe.y + safe.height * 0.86 };
  const pointer = cursor({ ...scene, timing: undefined }, [
    { at: 0, ...rest }, { at: 0.12, ...rest }, { at: 0.26, ...fieldPoint }, { at: 0.48, ...fieldPoint },
    { at: 0.6, ...buttonPoint }, { at: 0.92, ...buttonPoint }, { at: 1, ...rest },
  ].map((point) => ({ at: point.at, x: formatNumber(point.x), y: formatNumber(point.y) })), [0.29, 0.63], [0.09, 0.85, 0.88]);

  return {
    content: `
    ${layoutMetadata(scene.format, { ...regions, fields: form.area })}
    ${backdrop(scene, frame)}
    <rect ${rectAttrs(formPanel)} rx="${formatNumber(radius)}" data-fill="form" class="ln-hair" fill="var(--surface)" stroke="var(--border)" />
    <rect ${rectAttrs(form.title)} rx="${formatNumber(5 * k)}" fill="var(--ink)" opacity=".16" />
    ${fields}
    ${buttonMarkup}
    ${preview}
    ${pointer}`,
    model: { arrangement: beside ? "columns" : below ? "rows" : "stack", frame, keys: KEYS, regions },
    referenceWidth: frame.referenceWidth,
    viewBox: { height: frame.height, width: frame.width },
  };
}

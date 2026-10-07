import { composeScene } from "./compose/index.js";
import { hexHue, lightness, mixColors, resolveMix, toHex, withLightness } from "./color.js";
import { escapeXml } from "./utils.js";

const BASE_WIDTH = 1200;
const BASE_HEIGHT = 675;
const COMPACT_WIDTH = 720;
const COMPACT_HEIGHT = 405;

// Named motion tokens keep timing consistent without forcing every scene into
// the same choreography. Gentle adds a small authored overshoot via keyframes;
// these curves control how each segment approaches its next keyframe.
export const MOTION_EASING = Object.freeze({
  gentle: ".22 .8 .2 1",
  quick: ".16 1 .3 1",
  smoothMove: ".65 0 .35 1",
});

function easingSegments(name, count) {
  return Array.from({ length: count }, () => MOTION_EASING[name]).join(";");
}

// Stroke widths in screen px at a 720px-wide display. Lines follow the artwork
// as it scales, but stop at min/max so small embeds stay crisp and large hero
// placements do not turn outlines into hairlines.
const REFERENCE_DISPLAY_WIDTH = 720;
const STROKE_ROLES = Object.freeze({
  hair: { max: 1.5, min: 0.75, px: 1 },
  base: { max: 2.75, min: 1.25, px: 2 },
  strong: { max: 3, min: 1.4, px: 2.25 },
  heavy: { max: 4, min: 1.75, px: 3 },
});
const CURSOR_GLYPH_HEIGHT = 25;
const CURSOR_SIZE = Object.freeze({ max: 30, min: 14, px: 22 });
// Geometric 1.2x steps keep every tier narrower than the smallest max/min
// ratio above, so a clamped value cannot drift out of bounds inside its tier.
const SIZE_TIERS = Array.from({ length: 18 }, (_, index) => Math.round(160 * 1.2 ** index));
const COMPACT_MAX_WIDTH = 400;

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function desiredPx({ max, min, px }, width, reference = REFERENCE_DISPLAY_WIDTH) {
  return Math.min(max, Math.max(min, px * width / reference));
}

// User-unit value that renders `desiredPx` at `width` and stays within the role
// bounds anywhere in [low, high).
function userUnits(role, viewBoxWidth, width, low = width, high = width, glyph = 1, reference = REFERENCE_DISPLAY_WIDTH) {
  const toPx = (value, at) => value * glyph * at / viewBoxWidth;
  const ideal = desiredPx(role, width, reference) * viewBoxWidth / (glyph * width);
  const ceiling = role.max / toPx(1, high);
  const floor = role.min / toPx(1, low);
  return round(Math.min(ceiling, Math.max(floor, ideal)));
}

// `reference` is the display width at which the viewBox shows its design
// size; composed formats pass their own so a 9:16 frame matches a 16:9 one.
function sizeVariables(viewBoxWidth, width, low, high, reference) {
  const lines = Object.entries(STROKE_ROLES).map(([name, role]) => `--line-${name}: ${userUnits(role, viewBoxWidth, width, low, high, 1, reference)};`);
  const cursorScale = userUnits(CURSOR_SIZE, viewBoxWidth, width, low, high, CURSOR_GLYPH_HEIGHT, reference);
  return [...lines, `--cursor-scale: ${cursorScale};`].join(" ");
}

// Media queries inside an SVG document evaluate against the SVG's own rendered
// size, so one file picks the right tier inside any card, bento cell, or hero.
function sizeTierCss(viewBoxWidth, reference) {
  return SIZE_TIERS.map((low, index) => {
    const high = SIZE_TIERS[index + 1] || low * 1.2;
    const representative = Math.sqrt(low * high);
    return `@media (min-width: ${index === 0 ? 0 : low}px) { :root { ${sizeVariables(viewBoxWidth, representative, low, high, reference)} } }`;
  }).join("\n    ");
}

function timeline(scene) {
  const beats = scene.timing?.beats || [[0, 0], [1, 1]];
  const at = (time) => {
    const index = beats.findIndex(([source], position) => position > 0 && time <= source);
    const [x0, y0] = beats[Math.max(0, index - 1)];
    const [x1, y1] = beats[Math.max(1, index)];
    return round(y0 + (time - x0) * (y1 - y0) / (x1 - x0 || 1), 3);
  };
  const format = (value) => String(value).replace(/^0\./, ".");
  const k = (list) => list.split(";").map((value) => format(at(Number(value)))).join(";");
  return { at, format, k };
}

function clickRipple(duration, { at, format }, click) {
  const start = Math.max(0, at(click) - 0.025);
  const peak = Math.min(1, at(click) + 0.018);
  const end = Math.min(1, at(click) + 0.085);
  const keyTimes = [0, start, peak, end, 1].map((value) => format(round(value, 3))).join(";");
  return `<circle cx="0" cy="0" r="7" fill="none" stroke="var(--accent)" class="ln-cursor-ripple" opacity="0">
    <animate attributeName="r" values="7;7;24;29;7" keyTimes="${keyTimes}" dur="${duration}s" repeatCount="indefinite" />
    <animate attributeName="opacity" values="0;0;.62;0;0" keyTimes="${keyTimes}" dur="${duration}s" repeatCount="indefinite" />
  </circle>`;
}

// The translate track of the pointer and of anything it carries. A dragged
// element given the same frames (its own positions, same times and eases)
// moves on exactly the pointer's timing and easing, so it stays under the
// grab point. A frame's `ease` shapes the segment arriving at it.
export function pointerTrack(scene, frames) {
  const time = timeline(scene);
  const values = frames.map(({ x, y }) => `${x} ${y}`).join(";");
  const keyTimes = time.k(frames.map(({ at }) => at).join(";"));
  const keySplines = frames.slice(1).map(({ ease }) => MOTION_EASING[ease || "smoothMove"]).join(";");
  return `<animateTransform attributeName="transform" type="translate" values="${values}" keyTimes="${keyTimes}" calcMode="spline" keySplines="${keySplines}" dur="${scene.duration}s" repeatCount="indefinite" />`;
}

// The pointer never fades: it stays on screen across the loop seam, so the
// last frame must walk it back to where the first one rests.
export function cursor(scene, frames, clicks = []) {
  const duration = scene.duration;
  const time = timeline(scene);
  return `
    <g id="cursor">
      <g class="cursor-glyph">
        ${clicks.map((at) => clickRipple(duration, time, at)).join("")}
        <path d="M2.5 2 V27 L10 19.8 H21.5 Z" fill="var(--accent)" stroke="var(--cursor-outline)" class="ln-cursor" stroke-linejoin="round" filter="url(#cursor-shadow)" />
      </g>
      ${pointerTrack(scene, frames)}
    </g>`;
}

// Arc length of an absolute M/C path (the only commands the trends use),
// sampled finely enough to stay well under a pixel on any frame.
function cubicPathLength(d) {
  if (/[^MC\d\s.,-]/.test(d)) throw new Error(`pathSweep supports absolute M/C paths only: ${d}`);
  let length = 0;
  let point;
  for (const [, command, args] of d.matchAll(/([MC])([^MC]*)/g)) {
    const values = args.match(/-?(?:\d+\.?\d*|\.\d+)/g).map(Number);
    if (command === "M") {
      point = values.slice(0, 2);
      continue;
    }
    for (let index = 0; index < values.length; index += 6) {
      const [x1, y1, x2, y2, x, y] = values.slice(index, index + 6);
      let previous = point;
      for (let step = 1; step <= 64; step += 1) {
        const t = step / 64;
        const u = 1 - t;
        const at = (a, b, c, e) => u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * e;
        const next = [at(point[0], x1, x2, x), at(point[1], y1, y2, y)];
        length += Math.hypot(next[0] - previous[0], next[1] - previous[1]);
        previous = next;
      }
      point = [x, y];
    }
  }
  return length;
}

// A marker that travels a path and inks it on the way. animateMotion's
// keyPoints are fractions of the path length, so a dash offset of the same
// fraction ends the colored stroke exactly under the marker, drawing forward
// and erasing as it travels back. The length is measured here rather than
// with pathLength="1", which not every renderer applies to dashes.
export function pathSweep({ d, duration, marker, points, splines, times, trace }) {
  const timing = `keyTimes="${times.join(";")}" calcMode="spline" keySplines="${splines.join(";")}" dur="${duration}s" repeatCount="indefinite"`;
  const length = round(cubicPathLength(d), 2);
  const offsets = points.map((point) => round((1 - point) * length, 2));
  // The double-length gap keeps the pattern from wrapping a dash onto the
  // path start. The marker is hidden only for static renderers, which would
  // draw it at the origin.
  return `<path d="${d}" stroke-dasharray="${length} ${length * 2}" stroke-dashoffset="${offsets[0]}" fill="none" ${trace}>
      <animate attributeName="stroke-dashoffset" values="${offsets.join(";")}" ${timing} />
    </path>
    <circle ${marker} opacity="0">
      <set attributeName="opacity" to="1" />
      <animateMotion path="${d}" keyPoints="${points.join(";")}" ${timing} />
    </circle>`;
}

function dots() {
  return `<pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.25" fill="var(--border)" /></pattern>`;
}

// A static (non-animated) wash, so it is reduced-motion-safe for free. Stepped
// stop-opacity mirrors how sparing accent glows are built in restrained,
// mostly-neutral design systems: a soft halo, never a dominant fill.
function glow() {
  return `<radialGradient id="glow" cx="50%" cy="38%" r="65%">
    <stop offset="0%" stop-color="var(--accent)" stop-opacity=".16" />
    <stop offset="45%" stop-color="var(--accent)" stop-opacity=".07" />
    <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
  </radialGradient>`;
}

function sceneBackdrop(scene, opacity = 0.56) {
  if (scene.backdrop === "none") return "";
  const { width, height } = scene.concept === "flow" ? { width: COMPACT_WIDTH, height: COMPACT_HEIGHT } : { width: BASE_WIDTH, height: BASE_HEIGHT };
  if (scene.backdrop === "glow") return `<rect width="${width}" height="${height}" fill="url(#glow)" />`;
  const texture = scene.backdrop === "dots" ? `<rect width="${width}" height="${height}" fill="url(#dots)" opacity="${opacity}" class="lod-texture" />` : "";
  return texture;
}

function skeletonLines(x, y, widths = [88, 132]) {
  return widths.map((width, index) => `<rect${index === 0 ? "" : ` class="lod-fine"`} x="${x}" y="${y + index * 14}" width="${width}" height="5" rx="2.5" fill="var(--ink)" opacity="${index === 0 ? 0.2 : 0.1}" />`).join("");
}

function flowScene(scene) {
  const duration = scene.duration;
  const { k } = timeline(scene);
  const pointer = scene.motionProfile?.pointer !== "none";
  // Every cursor click below has target-local feedback: the add control opens
  // the layout, the picker row presses/highlights, and the inserted card settles.
  return `
    ${sceneBackdrop(scene, 0.62)}

    <path class="ln-base" d="M190 128 V277" stroke="var(--border-strong)" />
    <path class="ln-strong" d="M190 128 V162.5" stroke="var(--accent)" opacity="0">
      <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="${k("0;.68;.76;.9;1")}" dur="${duration}s" repeatCount="indefinite" />
    </path>
    <path class="ln-strong" d="M190 242.5 V277" stroke="var(--accent)" opacity="0">
      <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="${k("0;.7;.78;.9;1")}" dur="${duration}s" repeatCount="indefinite" />
    </path>

    <g>
      ${pointer ? `<animateTransform attributeName="transform" type="translate" values="0 56;0 56;0 -2;0 0;0 0;0 56" keyTimes="${k("0;.31;.42;.47;.88;1")}" calcMode="spline" keySplines="${easingSegments("gentle", 5)}" dur="${duration}s" repeatCount="indefinite" />` : ""}
      <rect class="ln-hair" x="40" y="48" width="300" height="80" rx="var(--radius)" fill="var(--surface)" stroke="var(--border-strong)" />
      <circle cx="76" cy="88" r="15" fill="var(--tag-1)" />
      <path class="ln-strong" d="M69 88h14M76 81v14" stroke="var(--accent-2)" opacity=".76" stroke-linecap="round" />
      ${skeletonLines(107, 75, [110, 158])}
    </g>

    <g opacity="0">
      <circle class="ln-hair" cx="190" cy="202.5" r="17" fill="var(--surface)" stroke="var(--accent)" />
      <path class="ln-strong" d="M183 202.5h14M190 195.5v14" stroke="var(--accent)" stroke-linecap="round" />
      <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="${k("0;.17;.23;.31;.37;1")}" dur="${duration}s" repeatCount="indefinite" />
    </g>

    <g id="inserted-card" opacity="${pointer ? "0" : "1"}" transform="translate(190 202.5)">
      <g>
        ${pointer ? `<animateTransform attributeName="transform" type="scale" values=".94;.94;1.018;1;1" keyTimes="${k("0;.36;.43;.49;1")}" calcMode="spline" keySplines="${easingSegments("gentle", 4)}" dur="${duration}s" repeatCount="indefinite" />` : ""}
        <g transform="translate(-190 -202.5)">
          <rect class="ln-base" x="40" y="162.5" width="300" height="80" rx="var(--radius)" fill="var(--accent-soft)" stroke="var(--accent)" stroke-dasharray="7 6">
            ${pointer ? `<animate attributeName="opacity" values="1;1;0;0;1" keyTimes="${k("0;.6;.68;.9;1")}" dur="${duration}s" repeatCount="indefinite" />` : ""}
          </rect>
          <rect class="ln-base" x="40" y="162.5" width="300" height="80" rx="var(--radius)" fill="var(--accent-soft)" stroke="var(--accent)" opacity="${pointer ? "0" : "1"}">
            ${pointer ? `<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="${k("0;.61;.69;.9;1")}" dur="${duration}s" repeatCount="indefinite" />` : ""}
          </rect>
          <circle class="ln-hair" cx="76" cy="202.5" r="15" fill="var(--tag-2)" stroke="var(--accent)" stroke-opacity=".42" />
          <path class="ln-strong" d="M69 202.5h14" stroke="var(--accent)" stroke-linecap="round" />
          ${skeletonLines(107, 189.5, [134, 86])}
        </g>
      </g>
      ${pointer ? `<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="${k("0;.34;.39;.9;1")}" dur="${duration}s" repeatCount="indefinite" />` : `<animate attributeName="opacity" values="1;1;.76;1;1" keyTimes="${k("0;.56;.66;.78;1")}" dur="${duration}s" repeatCount="indefinite" />`}
    </g>

    <g>
      ${pointer ? `<animateTransform attributeName="transform" type="translate" values="0 -56;0 -56;0 2;0 0;0 0;0 -56" keyTimes="${k("0;.31;.42;.47;.88;1")}" calcMode="spline" keySplines="${easingSegments("gentle", 5)}" dur="${duration}s" repeatCount="indefinite" />` : ""}
      <rect class="ln-hair" x="40" y="277" width="300" height="80" rx="var(--radius)" fill="var(--surface)" stroke="var(--border-strong)" />
      <circle cx="76" cy="317" r="15" fill="var(--tag-3)" />
      <path class="ln-strong" d="M70 311l12 12M82 311l-12 12" stroke="var(--ink)" opacity=".32" stroke-linecap="round" />
      ${skeletonLines(107, 304, [102, 150])}
    </g>

    <g id="step-picker">
      <rect class="ln-hair" x="380" y="48" width="300" height="309" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
      <rect x="400" y="68" width="72" height="7" rx="3.5" fill="var(--ink)" opacity=".14" />
      <rect class="lod-fine" x="480" y="68" width="42" height="7" rx="3.5" fill="var(--ink)" opacity=".07" />
      ${[91, 171, 251].map((y, index) => `<g${index === 0 ? ` id="clicked-option"` : ""}><rect class="ln-hair" x="400" y="${y}" width="260" height="70" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)"/><rect class="ln-base" x="400" y="${y}" width="260" height="70" rx="var(--radius)" fill="var(--accent-soft)" stroke="var(--accent)" opacity="0">${index === 0 ? `<animate attributeName="opacity" values="0;0;.08;.42;.16;0;0" keyTimes="${k("0;.47;.53;.58;.61;.69;1")}" calcMode="spline" keySplines="${easingSegments("quick", 6)}" dur="${duration}s" repeatCount="indefinite" />` : ""}</rect><rect x="418" y="${y + 20}" width="30" height="30" rx="var(--radius)" fill="var(--tag-${index + 1})"/><rect x="464" y="${y + 27}" width="${index === 0 ? 104 : 82}" height="8" rx="4" fill="var(--ink)" opacity="${index === 0 ? ".2" : ".11"}"/></g>`).join("")}
    </g>
    ${pointer ? cursor(scene, [
      { at: 0, x: 654, y: 350 },
      { at: 0.07, x: 654, y: 350 },
      { at: 0.29, x: 190, y: 202.5 },
      { at: 0.38, x: 190, y: 202.5 },
      { at: 0.53, x: 520, y: 126 },
      { at: 0.62, x: 520, y: 126 },
      { at: 0.76, x: 265, y: 202.5 },
      { at: 0.87, x: 265, y: 202.5 },
      { at: 1, x: 654, y: 350 },
    ], [0.31, 0.58]) : ""}
  `;
}

function voiceFlowScene(scene) {
  const duration = scene.duration;
  const { k } = timeline(scene);
  const rows = [74, 171, 268];
  const waveformTimes = "0;.125;.25;.375;.5;.625;.75;.875;1";
  const bars = [0, 1, 2, 3, 4].map((index) => {
    const x = 542 + index * 22;
    const heights = Array.from({ length: 8 }, (_, step) => 8 + ((index * 13 + step * 17) % 42));
    heights.push(heights[0]);
    const yValues = heights.map((height) => 206 - height / 2);
    return `<rect x="${x}" y="${yValues[0]}" width="8" height="${heights[0]}" rx="4" fill="var(--accent)" opacity=".82">
      <animate attributeName="y" values="${yValues.join(";")}" keyTimes="${waveformTimes}" dur="${duration}s" repeatCount="indefinite" />
      <animate attributeName="height" values="${heights.join(";")}" keyTimes="${waveformTimes}" dur="${duration}s" repeatCount="indefinite" />
      <animate attributeName="opacity" values=".58;.92;.7;1;.62;.9;.7;.96;.58" keyTimes="${waveformTimes}" dur="${duration}s" repeatCount="indefinite" />
    </rect>`;
  }).join("");

  const rowTransform = (index) => {
    if (index === 0) return `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 -4;0 101;0 97;0 97;0 0" keyTimes="${k("0;.42;.48;.62;.68;.9;1")}" calcMode="spline" keySplines="${easingSegments("gentle", 6)}" dur="${duration}s" repeatCount="indefinite" />`;
    if (index === 1) return `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 4;0 -101;0 -97;0 -97;0 0" keyTimes="${k("0;.42;.48;.62;.68;.9;1")}" calcMode="spline" keySplines="${easingSegments("gentle", 6)}" dur="${duration}s" repeatCount="indefinite" />`;
    return "";
  };

  return `
    ${sceneBackdrop(scene, 0.48)}

    ${rows.map((y, index) => `<g${index === 1 ? ` id="voice-updated-task"` : ""}>
      ${rowTransform(index)}
      <rect class="ln-hair" x="38" y="${y}" width="430" height="64" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
      ${index === 1 ? `<rect class="ln-hair" x="38" y="${y}" width="430" height="64" rx="var(--radius)" fill="var(--accent-soft)" stroke="var(--accent)" opacity="0">
        <animate attributeName="opacity" values="0;0;.08;.3;.18;.18;0" keyTimes="${k("0;.42;.5;.62;.72;.9;1")}" dur="${duration}s" repeatCount="indefinite" />
      </rect>` : ""}
      <circle cx="70" cy="${y + 32}" r="12" fill="var(--tag-${index + 1})" />
      <circle cx="70" cy="${y + 32}" r="4" fill="var(--accent-${index + 1})" opacity=".78" />
      <rect x="98" y="${y + 21}" width="${index === 0 ? 142 : index === 1 ? 176 : 118}" height="7" rx="3.5" fill="var(--ink)" opacity=".18" />
      <rect class="lod-fine" x="98" y="${y + 36}" width="${index === 0 ? 220 : index === 1 ? 196 : 252}" height="5" rx="2.5" fill="var(--ink)" opacity=".08" />
      <rect x="376" y="${y + 19}" width="66" height="26" rx="13" fill="var(--tag-${index + 1})" />
      ${index === 1 ? `<rect x="376" y="${y + 19}" width="66" height="26" rx="13" fill="var(--accent)" opacity="0">
        <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="${k("0;.56;.66;.9;1")}" dur="${duration}s" repeatCount="indefinite" />
      </rect><path class="ln-strong" d="M399 ${y + 32}l6 6 12-13" fill="none" stroke="var(--surface)" stroke-linecap="round" stroke-linejoin="round" opacity="0">
        <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="${k("0;.62;.68;.9;1")}" dur="${duration}s" repeatCount="indefinite" />
      </path>` : ""}
    </g>`).join("")}

    <g>
      <animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 4;0 -101;0 -97;0 -97;0 0" keyTimes="${k("0;.42;.48;.62;.68;.9;1")}" calcMode="spline" keySplines="${easingSegments("gentle", 6)}" dur="${duration}s" repeatCount="indefinite" />
      <path class="ln-base" d="M468 203 H504" stroke="var(--accent)" opacity="0">
        <animate attributeName="opacity" values="0;.16;.72;.72;.2;0" keyTimes="${k("0;.36;.46;.68;.86;1")}" dur="${duration}s" repeatCount="indefinite" />
      </path>
    </g>

    <g id="voice-control">
      <rect class="ln-hair" x="504" y="74" width="178" height="258" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
      <rect x="520" y="90" width="146" height="84" rx="var(--radius)" fill="var(--tag-4)" opacity=".72" />
      <circle cx="593" cy="132" r="25" fill="var(--tag-1)" />
      <path class="ln-strong" d="M593 117a8 8 0 0 0-8 8v9a8 8 0 0 0 16 0v-9a8 8 0 0 0-8-8Zm-14 16v2a14 14 0 0 0 28 0v-2M593 149v9" fill="none" stroke="var(--accent)" stroke-linecap="round" />
      <circle class="ln-base" cx="593" cy="132" r="25" fill="none" stroke="var(--accent)" opacity="0">
        <animate attributeName="r" values="25;34;25;38;25;33;25;36;25" keyTimes="${waveformTimes}" dur="${duration}s" repeatCount="indefinite" />
        <animate attributeName="opacity" values=".08;.5;.08;.56;.08;.42;.08;.5;.08" keyTimes="${waveformTimes}" dur="${duration}s" repeatCount="indefinite" />
      </circle>
      <g id="voice-waveform">${bars}</g>
      <rect x="532" y="258" width="122" height="7" rx="3.5" fill="var(--ink)" opacity=".1" />
      <rect class="lod-fine" x="548" y="277" width="90" height="5" rx="2.5" fill="var(--ink)" opacity=".06" />
    </g>
  `;
}

function listScene(scene) {
  const duration = scene.duration;
  const { k } = timeline(scene);
  return `
    <rect class="ln-hair" x="72" y="86" width="330" height="504" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
    <rect x="98" y="118" width="278" height="34" rx="var(--radius)" fill="var(--muted)" />
    <circle cx="118" cy="135" r="6" fill="var(--ink)" opacity=".15" />
    <rect x="136" y="131" width="88" height="7" rx="3" fill="var(--ink)" opacity=".12" />
    ${[186, 260, 334, 408].map((y, index) => `<g><rect x="98" y="${y}" width="278" height="58" rx="var(--radius)" fill="${index === 1 ? "var(--accent-soft)" : "var(--surface)"}" opacity="${index === 1 ? "0" : "1"}">${index === 1 ? `<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="${k("0;.46;.53;.9;1")}" dur="${duration}s" repeatCount="indefinite"/>` : ""}</rect><circle cx="120" cy="${y + 29}" r="10" fill="var(--tag-${index % 4 + 1})"/>${skeletonLines(144, y + 17, [118, 74])}</g>`).join("")}
    <g transform="translate(791 338)"><g>
      <animateTransform attributeName="transform" type="scale" values=".94;.94;1.012;1;1;.94" keyTimes="${k("0;.42;.54;.61;.9;1")}" calcMode="spline" keySplines="${easingSegments("gentle", 5)}" dur="${duration}s" repeatCount="indefinite" />
      <g transform="translate(-791 -338)">
        <rect class="ln-hair" x="454" y="86" width="674" height="504" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
        <rect x="496" y="132" width="150" height="12" rx="6" fill="var(--ink)" opacity=".18" />
        <rect x="496" y="164" width="392" height="7" rx="3.5" fill="var(--ink)" opacity=".08" />
        <rect class="lod-fine" x="496" y="184" width="302" height="7" rx="3.5" fill="var(--ink)" opacity=".06" />
        <rect x="496" y="240" width="590" height="220" rx="var(--radius)" fill="var(--tag-2)" opacity=".55" />
        <rect x="524" y="270" width="210" height="9" rx="4.5" fill="var(--ink)" opacity=".12" />
        ${[308, 346, 384, 422].map((y) => `<rect x="524" y="${y}" width="520" height="18" rx="var(--radius)" fill="var(--surface)" opacity=".7"/>`).join("")}
        <g transform="translate(1037 514)"><g>
          <animateTransform attributeName="transform" type="scale" values="1;1;.94;1.02;1;1" keyTimes="${k("0;.7;.74;.78;.83;1")}" calcMode="spline" keySplines="${easingSegments("quick", 5)}" dur="${duration}s" repeatCount="indefinite" />
          <rect x="-49" y="-18" width="98" height="36" rx="var(--radius)" fill="var(--accent)" opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="${k("0;.54;.62;.9;1")}" dur="${duration}s" repeatCount="indefinite"/></rect>
        </g></g>
      </g>
    </g></g>
    ${cursor(scene, [
      { at: 0, x: 760, y: 560 }, { at: .1, x: 760, y: 560 }, { at: .42, x: 242, y: 289 },
      { at: .52, x: 242, y: 289 }, { at: .72, x: 1028, y: 514 }, { at: .86, x: 1028, y: 514 }, { at: 1, x: 760, y: 560 },
    ], [.44, .74])}
  `;
}

const TREND_PATH = "M118 512 C210 460 240 486 324 410 C400 342 482 476 566 398 C654 318 730 428 812 350 C884 282 964 376 1082 322";

function dashboardScene(scene) {
  const duration = scene.duration;
  const { k } = timeline(scene);
  return `
    ${[72, 386, 700].map((x, index) => `<g><rect class="ln-hair" x="${x}" y="94" width="278" height="156" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)"/><circle cx="${x + 34}" cy="130" r="10" fill="var(--tag-${index + 1})"/><rect x="${x + 58}" y="124" width="82" height="8" rx="4" fill="var(--ink)" opacity=".1"/><rect x="${x + 28}" y="176" width="100" height="22" rx="5" fill="var(--ink)" opacity=".16"/><rect class="lod-fine" x="${x + 28}" y="214" width="${138 + index * 28}" height="5" rx="2.5" fill="var(--ink)" opacity=".07"/></g>`).join("")}
    <rect class="ln-hair" x="72" y="292" width="1056" height="292" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
    <path class="ln-heavy" d="${TREND_PATH}" fill="none" stroke="var(--border-strong)" />
    <line class="ln-hair" x1="118" y1="540" x2="1082" y2="540" stroke="var(--border)" />
    ${pathSweep({
      d: TREND_PATH,
      duration,
      marker: `r="8" fill="var(--accent)"`,
      points: [0, 0, 1, 1, 0, 0],
      splines: ["0 0 1 1", "0 0 1 1", "0 0 1 1", MOTION_EASING.smoothMove, "0 0 1 1"],
      times: k("0;.12;.72;.84;.96;1").split(";"),
      trace: `class="ln-heavy" stroke="var(--accent)" opacity=".82"`,
    })}
  `;
}

function editorScene(scene) {
  const duration = scene.duration;
  const { k } = timeline(scene);
  return `
    <rect class="ln-hair" x="72" y="76" width="650" height="524" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
    <rect x="112" y="122" width="224" height="12" rx="6" fill="var(--ink)" opacity=".16" />
    ${[180, 282, 384].map((y, index) => `<g><rect x="112" y="${y}" width="570" height="72" rx="var(--radius)" fill="var(--tag-${index + 1})" opacity=".55"/><rect x="134" y="${y + 20}" width="${132 + index * 30}" height="7" rx="3.5" fill="var(--ink)" opacity=".12"/><rect class="lod-fine" x="134" y="${y + 39}" width="${240 - index * 24}" height="6" rx="3" fill="var(--ink)" opacity=".07"/>${index === 1 ? `<rect class="ln-base" x="112" y="${y}" width="570" height="72" rx="var(--radius)" fill="none" stroke="var(--accent)" opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="${k("0;.42;.5;.9;1")}" dur="${duration}s" repeatCount="indefinite"/></rect>` : ""}</g>`).join("")}
    <g transform="translate(170 530)"><g>
      <animateTransform attributeName="transform" type="scale" values="1;1;.94;1.02;1;1" keyTimes="${k("0;.71;.75;.79;.84;1")}" calcMode="spline" keySplines="${easingSegments("quick", 5)}" dur="${duration}s" repeatCount="indefinite" />
      <rect x="-58" y="-20" width="116" height="40" rx="var(--radius)" fill="var(--accent)" opacity=".85" />
    </g></g>
    <g transform="translate(945 338)"><g>
      <animateTransform attributeName="transform" type="scale" values=".9;.9;.9;1.016;1;1;.9" keyTimes="${k("0;.42;.49;.6;.68;.9;1")}" calcMode="spline" keySplines="${easingSegments("gentle", 6)}" dur="${duration}s" repeatCount="indefinite" />
      <g transform="translate(-945 -338)">
        <rect class="ln-hair" x="762" y="136" width="366" height="404" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
        <circle cx="945" cy="270" r="64" fill="var(--tag-2)" />
        <path class="ln-mark" d="M914 270l20 20 43-46" fill="none" stroke="var(--accent)" stroke-linecap="round" stroke-linejoin="round" opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="${k("0;.58;.66;.9;1")}" dur="${duration}s" repeatCount="indefinite"/></path>
        ${skeletonLines(858, 374, [174, 128])}
      </g>
    </g></g>
    ${cursor(scene, [
      { at: 0, x: 650, y: 560 }, { at: .1, x: 650, y: 560 }, { at: .43, x: 240, y: 318 },
      { at: .54, x: 240, y: 318 }, { at: .73, x: 170, y: 530 }, { at: .86, x: 170, y: 530 }, { at: 1, x: 650, y: 560 },
    ], [.45, .75])}
  `;
}

// A swatch click recolors the shape via the same two-overlapping-shapes
// opacity crossfade `listScene` uses for row selection — no-overshoot color
// settle, immediate click feedback (the selection ring).
function paletteScene(scene) {
  const duration = scene.duration;
  const { k } = timeline(scene);
  const chips = [436, 524, 612, 700];
  const pickedIndex = 2;
  return `
    ${sceneBackdrop(scene, 0.5)}
    <rect class="ln-hair" x="300" y="97" width="600" height="480" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
    <g transform="translate(600 290)">
      <circle class="ln-base" r="100" fill="var(--tag-1)" stroke="var(--border-strong)" opacity="1">
        <animate attributeName="opacity" values="1;1;0;0;1" keyTimes="${k("0;.3;.36;.88;1")}" dur="${duration}s" repeatCount="indefinite" />
      </circle>
      <circle class="ln-base" r="100" fill="var(--tag-${pickedIndex + 1})" stroke="var(--border-strong)" opacity="0">
        <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="${k("0;.31;.37;.88;1")}" dur="${duration}s" repeatCount="indefinite" />
      </circle>
    </g>
    <g transform="translate(436 494)">
      ${chips.map((_, index) => `<g transform="translate(${index * 88} 0)">
        <rect class="ln-hair" width="64" height="64" rx="var(--radius)" fill="var(--tag-${index + 1})" stroke="var(--border)" />
        ${index === pickedIndex ? `<rect class="ln-strong" x="-6" y="-6" width="76" height="76" rx="var(--radius)" fill="none" stroke="var(--accent)" opacity="0">
          <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="${k("0;.27;.33;.88;1")}" dur="${duration}s" repeatCount="indefinite" />
        </rect>` : ""}
      </g>`).join("")}
    </g>
    ${cursor(scene, [
      { at: 0, x: 950, y: 610 }, { at: .08, x: 950, y: 610 },
      { at: .28, x: 644, y: 526 }, { at: .34, x: 644, y: 526 },
      { at: .9, x: 644, y: 526 }, { at: 1, x: 950, y: 610 },
    ], [.3])}
  `;
}

// A shape dragged onto a dotted alignment grid: guides appear while it
// travels (space opens before the settle, per invariant 2) and fade once it
// snaps, so the loop resets exactly where it started.
function layoutScene(scene) {
  const duration = scene.duration;
  const { k } = timeline(scene);
  return `
    ${sceneBackdrop(scene, 0.5)}
    <g>
      <line class="ln-hair" x1="630" y1="250" x2="630" y2="490" stroke="var(--accent)" opacity="0">
        <animate attributeName="opacity" values="0;0;1;1;1;0;0" keyTimes="${k("0;.3;.38;.48;.6;.7;1")}" dur="${duration}s" repeatCount="indefinite" />
      </line>
      <line class="ln-hair" x1="510" y1="370" x2="750" y2="370" stroke="var(--accent)" opacity="0">
        <animate attributeName="opacity" values="0;0;1;1;1;0;0" keyTimes="${k("0;.3;.38;.48;.6;.7;1")}" dur="${duration}s" repeatCount="indefinite" />
      </line>
    </g>
    <g>
      <animateTransform attributeName="transform" type="translate" values="-220 -90;-220 -90;-14 -6;0 0;0 0;-220 -90" keyTimes="${k("0;.28;.4;.48;.86;1")}" calcMode="spline" keySplines="${easingSegments("gentle", 5)}" dur="${duration}s" repeatCount="indefinite" />
      <rect class="ln-base" x="560" y="300" width="140" height="140" rx="var(--radius)" fill="var(--tag-2)" stroke="var(--border-strong)" />
    </g>
    ${cursor(scene, [
      { at: 0, x: 950, y: 580 }, { at: .08, x: 950, y: 580 },
      { at: .2, x: 410, y: 280 }, { at: .28, x: 410, y: 280 },
      { at: .46, x: 630, y: 370 }, { at: .52, x: 630, y: 370 },
      { at: .9, x: 630, y: 370 }, { at: 1, x: 950, y: 580 },
    ], [.24])}
  `;
}

export function renderSvg(scene) {
  const { palette, viewport } = scene;
  const accents = palette.accents?.length ? palette.accents : [palette.accent];
  const pastels = palette.pastels?.length ? palette.pastels : [];
  const accentAt = (index) => accents[index] || accents[index % accents.length] || palette.accent;
  const tagAt = (index) => resolveMix(pastels[index]) || mixColors(accentAt(index), 14, palette.surface);
  // Small identity marks (avatars, category dots) carry a multicolor brand's
  // own hues at full strength.
  // Untoned items take shades of the main color, so other hues appear only
  // where the story gives an element one for a reason. A one-color brand's
  // marks are those shades too, at full strength first.
  const shadeAt = (amount) => mixColors(accentAt(0), amount, palette.surface);
  const markAt = (index) => (palette.colorMode === "multicolor" && accents.length > 1 ? accentAt(index) : shadeAt([100, 72, 50, 36][index]));
  const tintAt = (amount) => mixColors(accentAt(0), amount, palette.surface);
  // Checks read green and crosses red; the brand's own green or red when it has one.
  // Only a strong brand color can stand in: a pale mint or blush reads as a tint, not as success or failure.
  const strong = (hex) => {
    const [r, g, b] = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
    const top = Math.max(r, g, b);
    return top - Math.min(r, g, b) >= 0.45 && 0.2126 * r + 0.7152 * g + 0.0722 * b <= 0.7;
  };
  const brandHue = (test) => accents.map(toHex).find((hex) => hex && strong(hex) && test(hexHue(hex)));
  const success = brandHue((hue) => hue >= 90 && hue <= 170) || "#1fa463";
  const danger = brandHue((hue) => hue >= 345 || hue <= 15) || "#e5484d";
  // Status marks are a soft disc with a colored glyph, the glyph darker on
  // light surfaces and lighter on dark ones, so any brand green or red keeps
  // its contrast in both themes. A failed button is filled at a lightness
  // that carries a white cross in either theme.
  const darkSurface = toHex(palette.surface) ? lightness(toHex(palette.surface)) < 0.5 : false;
  const status = (color) => ({
    fill: withLightness(color, darkSurface ? 0.62 : 0.58),
    ink: withLightness(color, darkSurface ? 0.8 : 0.5),
    soft: mixColors(withLightness(color, darkSurface ? 0.7 : 0.6), darkSurface ? 26 : 16, palette.surface),
  });
  const [ok, failed] = [status(success), status(danger)];
  const composed = scene.composed ? composeScene(scene) : undefined;
  const viewBox = composed?.viewBox || (scene.concept === "flow"
    ? { height: COMPACT_HEIGHT, width: COMPACT_WIDTH }
    : { height: BASE_HEIGHT, width: BASE_WIDTH });
  const reference = composed?.referenceWidth;
  const content = composed ? composed.content
    : scene.concept === "flow" && scene.motion === "voice-to-task" ? voiceFlowScene(scene)
    : scene.concept === "flow" ? flowScene(scene)
    : scene.concept === "list" ? listScene(scene)
      : scene.concept === "dashboard" ? dashboardScene(scene)
        : scene.concept === "palette" ? paletteScene(scene)
          : scene.concept === "layout" ? layoutScene(scene)
            : editorScene(scene);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${viewport.width}" height="${viewport.height}" viewBox="0 0 ${viewBox.width} ${viewBox.height}" role="img" aria-labelledby="title description">
  <title id="title">${escapeXml(scene.name)} — ${escapeXml(scene.motion)}</title>
  <desc id="description">Minimal ${escapeXml(scene.concept)} product illustration generated from ${escapeXml(scene.source.input)}.</desc>
  <style>
    :root {
      --accent: ${palette.accent};
      --accent-1: ${accentAt(0)};
      --accent-2: ${accentAt(1)};
      --accent-3: ${accentAt(2)};
      --accent-4: ${accentAt(3)};
      --accent-soft: ${mixColors(palette.accent, 12, palette.surface)};
      --background: ${palette.background};
      --border: ${palette.border};
      --border-strong: ${mixColors(palette.foreground, 18, palette.surface)};
      --cursor-outline: ${palette.background};
      --ink: ${palette.foreground};
      --muted: ${palette.muted};
      --canvas: ${palette.canvas || palette.background};
      --radius: ${palette.radius}px;
      --surface: ${palette.surface};
      --tag-1: ${tagAt(0)};
      --tag-2: ${tagAt(1)};
      --tag-3: ${tagAt(2)};
      --tag-4: ${tagAt(3)};
      --mark-1: ${markAt(0)};
      --mark-2: ${markAt(1)};
      --mark-3: ${markAt(2)};
      --mark-4: ${markAt(3)};
      --shade-1: ${shadeAt(100)};
      --shade-2: ${shadeAt(72)};
      --shade-3: ${shadeAt(50)};
      --tint-1: ${tintAt(14)};
      --tint-2: ${tintAt(22)};
      --tint-3: ${tintAt(9)};
      --success: ${ok.ink};
      --success-soft: ${ok.soft};
      --danger: ${failed.ink};
      --danger-soft: ${failed.soft};
      --danger-fill: ${failed.fill};
      ${sizeVariables(viewBox.width, viewport.width, viewport.width, viewport.width, reference)}
    }
    ${sizeTierCss(viewBox.width, reference)}
    ${Object.keys(STROKE_ROLES).map((name) => `.ln-${name} { stroke-width: var(--line-${name}); }`).join(" ")}
    .ln-mark { stroke-width: 7; }
    .ln-cursor { stroke-width: 2.2; }
    .ln-cursor-ripple { stroke-width: 2; }
    .cursor-glyph { transform: scale(var(--cursor-scale)); }
    @media (max-width: ${COMPACT_MAX_WIDTH - 0.02}px) { .lod-fine, .lod-texture { display: none; } }
    @media (prefers-reduced-motion: reduce) { svg { visibility: visible; } }
  </style>
  <defs>${dots()}${glow()}<filter id="cursor-shadow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity=".28" /></filter></defs>
  ${content}
</svg>`;
  return svg.replace(/[ \t]+$/gm, "");
}

export const __testing = { CURSOR_SIZE, SIZE_TIERS, STROKE_ROLES, timeline };

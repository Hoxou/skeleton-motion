// Color mixing resolved to plain hex where both inputs are hex. Chrome draws
// `color-mix()` read through a custom property wrongly (a saturated yellow)
// when the fill also has `fill-opacity` inside a group whose opacity is
// animating, so mixes the renderer can compute never reach the SVG as
// `color-mix()`.

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const MIX = /^color-mix\(in oklab,\s*(#[0-9a-f]{3,6})\s+([\d.]+)%,\s*(#[0-9a-f]{3,6})\s*\)$/i;

function channels(hex) {
  const value = hex.length === 4 ? [...hex.slice(1)].map((digit) => digit + digit).join("") : hex.slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
}

const toLinear = (value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const fromLinear = (value) => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);

function toOklab(hex) {
  const [r, g, b] = channels(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function fromOklab([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return `#${rgb.map((value) => Math.round(Math.max(0, Math.min(1, fromLinear(value))) * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** `color-mix(in oklab, a percent%, b)`, as hex when both colors are hex. */
export function mixColors(a, percent, b) {
  if (!HEX.test(a) || !HEX.test(b)) return `color-mix(in oklab, ${a} ${percent}%, ${b})`;
  const [from, to] = [toOklab(a), toOklab(b)];
  const t = percent / 100;
  return fromOklab(from.map((value, index) => value * t + to[index] * (1 - t)));
}

/** Resolves a `color-mix(in oklab, #a N%, #b)` string to hex; anything else is returned as is. */
export function resolveMix(value) {
  const match = MIX.exec(String(value || "").trim());
  return match ? mixColors(match[1], Number(match[2]), match[3]) : value;
}

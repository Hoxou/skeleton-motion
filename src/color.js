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

/** `#rgb`, `#rrggbb`, or `rgb()`/`rgba()` as lowercase `#rrggbb`; null otherwise or when mostly transparent. */
export function toHex(value) {
  const text = String(value || "").trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(text)) return `#${[...text.slice(1)].map((digit) => digit + digit).join("")}`;
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  if (/^#[0-9a-f]{8}$/.test(text)) return Number.parseInt(text.slice(7), 16) < 128 ? null : text.slice(0, 7);
  const hsl = text.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (hsl) {
    const alpha = hsl[4] === undefined ? 1 : hsl[4].endsWith("%") ? Number.parseFloat(hsl[4]) / 100 : Number(hsl[4]);
    if (alpha < 0.5) return null;
    const [h, sat, light] = [Number(hsl[1]) % 360, Number(hsl[2]) / 100, Number(hsl[3]) / 100];
    const chroma = (1 - Math.abs(2 * light - 1)) * sat;
    const at = (n) => {
      const k = (n + h / 30) % 12;
      return light - chroma / 2 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return `#${[0, 8, 4].map((n) => Math.round(Math.max(0, Math.min(1, at(n))) * 255).toString(16).padStart(2, "0")).join("")}`;
  }
  const match = text.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (!match) return null;
  const alpha = match[4] === undefined ? 1 : match[4].endsWith("%") ? Number.parseFloat(match[4]) / 100 : Number(match[4]);
  if (alpha < 0.5) return null;
  return `#${match.slice(1, 4).map((part) => Math.max(0, Math.min(255, Math.round(Number(part)))).toString(16).padStart(2, "0")).join("")}`;
}

export function hexHue(hex) {
  const [r, g, b] = channels(hex);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (!delta) return 0;
  const sector = max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return sector * 60;
}

export const hueGap = (a, b) => {
  const gap = Math.abs(hexHue(a) - hexHue(b));
  return Math.min(gap, 360 - gap);
};

/** A color that reads as a hue: saturated enough and not near black. */
export function isVivid(hex) {
  const [r, g, b] = channels(hex);
  const top = Math.max(r, g, b);
  return top >= 0.55 && top > 0 && ((top - Math.min(r, g, b)) / top) * top >= 0.3;
}

const FAMILY_GAP = 25;
const MIN_SHARE = 0.04;

/**
 * Groups weighted colors into hue families and returns each family's share
 * of the total, largest first. A family is named by its heaviest member.
 * @param weighted Array<[color, weight]>; non-hex and non-vivid colors are ignored
 * @returns Array<{ hex, share }> with shares summing to 1 (families under 4% dropped)
 */
export function colorFamilies(weighted) {
  const totals = new Map();
  for (const [value, weight] of weighted) {
    const hex = toHex(value);
    if (hex && isVivid(hex) && weight > 0) totals.set(hex, (totals.get(hex) || 0) + weight);
  }
  const families = [];
  for (const [hex, weight] of [...totals].sort((a, b) => b[1] - a[1])) {
    const family = families.find((candidate) => hueGap(candidate.hex, hex) < FAMILY_GAP);
    if (family) family.weight += weight;
    else families.push({ hex, weight });
  }
  const sum = families.reduce((total, family) => total + family.weight, 0);
  if (!sum) return [];
  const kept = families.map((family) => ({ hex: family.hex, share: family.weight / sum })).filter((family) => family.share >= MIN_SHARE).sort((a, b) => b.share - a.share);
  const keptSum = kept.reduce((total, family) => total + family.share, 0);
  return kept.map((family) => ({ hex: family.hex, share: Number((family.share / keptSum).toFixed(4)) }));
}

/** Perceived lightness (OKLab L, 0 to 1) of a hex color. */
export function lightness(hex) {
  return toOklab(hex)[0];
}

/**
 * The same hue and chroma at another lightness, clamped into sRGB. Used to
 * keep a status color legible on both light and dark surfaces.
 */
export function withLightness(hex, target) {
  if (!HEX.test(hex)) return hex;
  const [, a, b] = toOklab(hex);
  // Lower chroma until the color fits sRGB at that lightness.
  for (let scale = 1; scale > 0; scale -= 0.05) {
    const out = fromOklab([target, a * scale, b * scale]);
    const back = toOklab(out);
    if (Math.abs(back[0] - target) < 0.02) return out;
  }
  return fromOklab([target, 0, 0]);
}

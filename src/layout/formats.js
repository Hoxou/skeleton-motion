// Every format shares one coordinate system: the short side is always 1000
// units, so inset, gutter, and type-like sizes keep the same proportion of the
// frame whether the asset lands in a 16:9 hero or a 9:16 story.
const SHORT_SIDE = 1000;
// Display size, in CSS px, of the short side the stroke and cursor tokens are
// tuned for (a 720x405 landscape embed).
const REFERENCE_SHORT_PX = 405;
const INSET = 100;
const GUTTER = 100;

export const FORMATS = Object.freeze({
  "16:9": { id: "16:9", layout: "wide", ratio: 16 / 9, slug: "16x9" },
  "4:3": { id: "4:3", layout: "landscape", ratio: 4 / 3, slug: "4x3" },
  "1:1": { id: "1:1", layout: "square", ratio: 1, slug: "1x1" },
  "4:5": { id: "4:5", layout: "portrait", ratio: 4 / 5, slug: "4x5" },
  "9:16": { id: "9:16", layout: "tall", ratio: 9 / 16, slug: "9x16" },
});

export const DEFAULT_ASPECTS = Object.freeze(Object.keys(FORMATS));
export const PRIMARY_ASPECT = "16:9";

export function parseAspect(value) {
  if (FORMATS[value]) return FORMATS[value];
  const match = String(value).match(/^(\d+(?:\.\d+)?)[:x](\d+(?:\.\d+)?)$/);
  if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0) {
    throw new Error(`unsupported aspect: ${value} (use ${DEFAULT_ASPECTS.join(", ")} or W:H)`);
  }
  const ratio = Number(match[1]) / Number(match[2]);
  return { id: `${match[1]}:${match[2]}`, layout: layoutClass(ratio), ratio, slug: `${match[1]}x${match[2]}` };
}

export function customFormat(width, height) {
  const ratio = width / height;
  return { custom: true, id: `${width}:${height}`, layout: layoutClass(ratio), ratio, slug: `${width}x${height}`, viewport: { height, width } };
}

// Explicit --aspects wins; an exact --width/--height pair is one custom
// rectangle; otherwise every default format is generated.
export function resolveFormats(options) {
  if (options.aspects?.length) return options.aspects;
  if (options.width || options.height) return [customFormat(options.width || 720, options.height || 405)];
  return DEFAULT_ASPECTS.map((id) => FORMATS[id]);
}

export function layoutClass(ratio) {
  if (ratio >= 1.6) return "wide";
  if (ratio >= 1.15) return "landscape";
  if (ratio >= 0.9) return "square";
  if (ratio >= 0.7) return "portrait";
  return "tall";
}

export function viewportFor(format, shortSidePx = REFERENCE_SHORT_PX) {
  return format.ratio >= 1
    ? { height: shortSidePx, width: Math.round(shortSidePx * format.ratio) }
    : { height: Math.round(shortSidePx / format.ratio), width: shortSidePx };
}

export function frameFor(format) {
  const width = format.ratio >= 1 ? Math.round(SHORT_SIDE * format.ratio) : SHORT_SIDE;
  const height = format.ratio >= 1 ? SHORT_SIDE : Math.round(SHORT_SIDE / format.ratio);
  return {
    gutter: GUTTER,
    height,
    inset: INSET,
    referenceWidth: width * REFERENCE_SHORT_PX / SHORT_SIDE,
    safe: { height: height - INSET * 2, width: width - INSET * 2, x: INSET, y: INSET },
    unitPx: REFERENCE_SHORT_PX / SHORT_SIDE,
    width,
  };
}

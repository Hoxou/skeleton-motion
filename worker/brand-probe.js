const MARKER_ID = "__skeleton_motion_brand";
const MARKER = new RegExp(`<script[^>]+id="${MARKER_ID}"[^>]*>([\\s\\S]*?)</script>`);
const HEX = /^#[0-9a-f]{6}$/i;
const LENGTH = /^\d+(?:\.\d+)?px$/;

// Runs inside the rendered page and evaluates to the measurements. Computed
// styles reflect CSS-in-JS, CDN stylesheets, and runtime theming that raw
// HTML hides. Colors go through a 1x1 canvas because Chrome reports modern
// formats (oklch, color()) as written, not as rgb().
const PROBE_BODY = `(() => {
  const ctx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", { willReadFrequently: true });
  const seen = new Map();
  const hex = (value) => {
    if (!value || value === "none" || value === "transparent") return null;
    if (seen.has(value)) return seen.get(value);
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    const result = a < 128 ? null : "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
    seen.set(value, result);
    return result;
  };
  const chroma = (h) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const max = Math.max(r, g, b);
    return max === 0 ? 0 : ((max - Math.min(r, g, b)) / max) * (max / 255);
  };
  const fold = innerHeight * 1.5;
  const shown = (el) => {
    const box = el.getBoundingClientRect();
    return box.width >= 8 && box.height >= 8 && box.top < fold && box.bottom > 0;
  };
  const surface = [document.body, document.documentElement].map((el) => hex(getComputedStyle(el).backgroundColor)).find(Boolean) || "#ffffff";
  const vivid = new Map();
  const neutral = new Map();
  const radii = [];
  const tally = (color, weight) => {
    if (!color || color === surface) return;
    const bucket = chroma(color) >= 0.2 ? vivid : neutral;
    bucket.set(color, (bucket.get(color) || 0) + weight);
  };
  const gradientColors = (image) => (image.match(/(?:rgba?|oklch|oklab|lab|lch|hsla?|color)\\([^)]*\\)|#[0-9a-f]{3,8}\\b/gi) || []).map(hex);
  const controls = [...document.querySelectorAll("a, button, [role=button], input[type=submit]")].filter(shown).slice(0, 200);
  // A control's own fill is the strongest brand signal. Children are often
  // illustrations or category badges inside link cards, so they count little.
  for (const control of controls) {
    [control, ...control.querySelectorAll("*")].slice(0, 6).forEach((node, depth) => {
      const style = getComputedStyle(node);
      const fill = hex(style.backgroundColor);
      if (fill && fill !== surface) {
        tally(fill, depth === 0 ? 4 : 0.5);
        if (depth === 0) radii.push(parseFloat(style.borderTopLeftRadius) || 0);
      }
      for (const color of gradientColors(style.backgroundImage)) tally(color, depth === 0 ? 2 : 0.5);
      if (depth === 0) tally(hex(style.color), 1);
    });
  }
  for (const shape of [...document.querySelectorAll("header svg *, nav svg *")].slice(0, 80)) tally(hex(getComputedStyle(shape).fill), 2);
  const top = (map) => [...map].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  // Coverage of every vivid color on the page: fills and gradient stops by
  // box size (a gradient's stops share it), SVG shapes by their box, text by
  // its glyph area. Each element counts by the square root of its area, so a
  // color the page repeats (buttons, links, icons, tags) outweighs one that
  // paints a few big content tiles. Photos, video, and canvas are skipped:
  // their colors are content, not brand. Controls count triple, as a call to
  // action is small but central. Sections that switch between dark and
  // light backgrounds only add neutrals, which never count.
  const coverage = new Map();
  const add = (color, weight) => {
    if (color && weight > 0 && chroma(color) >= 0.25) coverage.set(color, (coverage.get(color) || 0) + Math.sqrt(weight));
  };
  const reach = Math.min(document.documentElement.scrollHeight, innerHeight * 6);
  // The site's own logo is the one mark sure to be the brand, so its colors
  // count far more than content tiles of the same size.
  const logos = new Set([...document.querySelectorAll('a[href="/"], a[href="./"], [class*="logo" i], [id*="logo" i], [aria-label*="logo" i]')].slice(0, 12));
  const inLogo = (node) => [...logos].some((logo) => logo.contains(node));
  for (const node of [...document.querySelectorAll("body *")].slice(0, 4000)) {
    if (node.closest("img, picture, video, canvas, iframe")) continue;
    const box = node.getBoundingClientRect();
    if (box.width < 2 || box.height < 2 || box.top + scrollY > reach) continue;
    const style = getComputedStyle(node);
    if (style.visibility === "hidden" || Number(style.opacity) === 0) continue;
    const area = Math.min(box.width, innerWidth) * Math.min(box.height, innerHeight);
    const boost = inLogo(node) ? 8 : node.matches("a, button, [role=button]") ? 3 : 1;
    const fill = hex(style.backgroundColor);
    const parent = node.parentElement ? hex(getComputedStyle(node.parentElement).backgroundColor) : null;
    if (fill && fill !== parent) add(fill, area * boost);
    const stops = gradientColors(style.backgroundImage).filter(Boolean);
    for (const color of stops) add(color, (area * boost) / stops.length);
    if (node instanceof SVGElement) {
      add(hex(style.fill), area * boost);
      add(hex(style.stroke), area * boost * 0.2);
    }
    if ([...node.childNodes].some((child) => child.nodeType === 3 && child.textContent.trim())) {
      const size = parseFloat(style.fontSize) || 14;
      add(hex(style.color), node.textContent.trim().length * size * size * 0.5 * boost);
    }
  }
  const accent = top(vivid) || top(neutral);
  const total = [...coverage.values()].reduce((sum, weight) => sum + weight, 0) || 1;
  const shares = [...coverage].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([color, weight]) => [color, Number((weight / total).toFixed(5))]);
  radii.sort((a, b) => a - b);
  const bodyStyle = getComputedStyle(document.body);
  const heading = document.querySelector("h1, h2");
  // What the product says about itself once rendered, for the story designer.
  // Doubled backslash: this code lives in a template literal.
  const words = (el) => (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
  const unique = (list, max, length) => [...new Set(list.map((value) => value.slice(0, length)).filter((value) => value.length > 1))].slice(0, max);
  const content = {
    actions: unique([...document.querySelectorAll("button, [role=button], nav a, header a")].filter(shown).map(words), 30, 40),
    description: document.querySelector('meta[name="description"], meta[property="og:description"]')?.content || "",
    headings: unique([...document.querySelectorAll("h1, h2, h3")].map(words), 24, 120),
    text: words(document.querySelector("main") || document.body).slice(0, 6000),
    title: document.title,
  };
  return {
    accent,
    background: surface,
    shares,
    content,
    fontBody: bodyStyle.fontFamily,
    fontHeading: heading ? getComputedStyle(heading).fontFamily : null,
    foreground: hex(bodyStyle.color),
    radius: radii.length ? radii[Math.floor(radii.length / 2)] + "px" : null,
  };
})()`;

// For the content Quick Action: embeds the result in the DOM so the
// returned HTML carries it. Strict-CSP pages block this injected script.
export const PROBE_SCRIPT = `(() => {
  const marker = document.createElement("script");
  marker.type = "application/json";
  marker.id = "${MARKER_ID}";
  marker.textContent = JSON.stringify(${PROBE_BODY});
  document.documentElement.appendChild(marker);
})();`;

// For Browser Sessions: page.evaluate runs outside the page's CSP.
export const PROBE_EXPRESSION = `JSON.stringify(${PROBE_BODY})`;

// next/font serves hashed families such as "__Inter_d65c78" plus a
// "__Inter_Fallback_d65c78" metric shim; keep the readable family only.
function cleanFont(value) {
  const stack = String(value || "")
    .replace(/[;{}<>]/g, "")
    .split(",")
    .map((name) => name.trim().replace(/^(["']?)__([A-Za-z0-9]+?)_[0-9a-f]{6}\1$/, '"$2"'))
    .filter((name) => name && !/fallback/i.test(name))
    .join(", ")
    .slice(0, 200);
  return stack || null;
}

const plain = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

// Page text is untrusted and only ever fed to the model as data.
function contentOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  const list = (values, max, length) => (Array.isArray(values) ? values.map((value) => plain(value, length)).filter(Boolean).slice(0, max) : []);
  const content = {
    actions: list(raw.actions, 30, 40),
    description: plain(raw.description, 300),
    headings: list(raw.headings, 24, 120),
    text: plain(raw.text, 6000),
    title: plain(raw.title, 120),
  };
  return content.text || content.headings.length ? content : null;
}

/**
 * Validates probe JSON. Values come from an untrusted page, so only plain
 * hex colors, px radii (pills clamp to 48px), and sanitized font stacks
 * survive. Returns null when nothing useful was measured.
 */
export function parseProbe(json) {
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const color = (value) => (HEX.test(value || "") ? value.toLowerCase() : null);
  const radius = LENGTH.test(raw.radius || "") ? `${Math.min(48, Math.round(Number.parseFloat(raw.radius)))}px` : null;
  const probe = {
    accent: color(raw.accent),
    background: color(raw.background),
    shares: (Array.isArray(raw.shares) ? raw.shares : [])
      .filter((entry) => Array.isArray(entry) && color(entry[0]) && Number.isFinite(entry[1]) && entry[1] > 0 && entry[1] <= 1)
      .slice(0, 16)
      .map(([value, share]) => [color(value), Number(share)]),
    fontBody: cleanFont(raw.fontBody),
    fontHeading: cleanFont(raw.fontHeading),
    foreground: color(raw.foreground),
    radius,
    ...(contentOf(raw.content) ? { content: contentOf(raw.content) } : {}),
  };
  return probe.accent || probe.fontBody || probe.content ? probe : null;
}

/** Reads the probe marker the content Quick Action leaves in rendered HTML. */
export function readProbe(html) {
  const match = String(html || "").match(MARKER);
  return match ? parseProbe(match[1]) : null;
}

function channels(hex) {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
}

function mix(from, to, amount) {
  const [a, b] = [channels(from), channels(to)];
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, "0")).join("")}`;
}

function isDark(hex) {
  const [r, g, b] = channels(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
}

/**
 * Turns a probe into CSS the analyzer already understands, so measured
 * values flow through the same palette and typography inference. Surfaces
 * are derived from the measured page and text colors so cards keep
 * contrast; a dark page fills the dark theme and the light one is derived.
 */
export function probeToCss(probe) {
  const page = probe.background || "#ffffff";
  const ink = probe.foreground || (isDark(page) ? "#fafafa" : "#171717");
  const dark = isDark(page);
  const theme = [
    `--background: ${page};`,
    `--foreground: ${ink};`,
    `--card: ${mix(page, ink, dark ? 0.06 : 0)};`,
    `--muted: ${mix(page, ink, dark ? 0.1 : 0.05)};`,
    `--border: ${mix(page, ink, dark ? 0.16 : 0.12)};`,
    `--muted-foreground: ${mix(ink, page, 0.45)};`,
  ].join(" ");
  const shared = [
    // The measured call-to-action color is a strong hint, not a brand token:
    // the analyzer weighs it against how much of the page it covers.
    probe.accent && `--measured-primary: ${probe.accent};`,
    probe.radius && `--radius: ${probe.radius};`,
    ...(probe.shares || []).map(([value, share], index) => `--measured-share-${index + 1}: ${value} ${share};`),
  ].filter(Boolean).join(" ");
  const font = probe.fontHeading || probe.fontBody;
  return [
    `:root { ${shared}${dark ? "" : ` ${theme}`} }`,
    dark ? `.dark { ${theme} }` : "",
    font ? `body { font-family: ${font}; }` : "",
  ].filter(Boolean).join("\n") + "\n";
}

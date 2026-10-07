// Strict well-formedness check for the SVG this project emits. Browsers
// refuse to decode an SVG image with a single XML error (an HTML-style bare
// attribute such as `<g data-drag>` broke a whole example once), so tests
// run every rendered asset through this.
const TAG = /<(\/?)([A-Za-z][\w:.-]*)([^>]*)>/g;
const ATTRIBUTE = /\s+[A-Za-z_:][\w:.-]*="[^"<]*"/g;
const BARE_AMPERSAND = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i;

export function wellFormedErrors(xml) {
  const errors = [];
  const body = xml.replace(/^<\?xml[^>]*\?>/, "").replace(/<!--[\s\S]*?-->/g, "");
  const stack = [];
  let last = 0;
  for (const match of body.matchAll(TAG)) {
    const text = body.slice(last, match.index);
    if (text.includes("<")) errors.push(`stray "<" before <${match[2]}>`);
    if (BARE_AMPERSAND.test(text)) errors.push(`unescaped "&" before <${match[2]}>`);
    const [, closing, name, rest] = match;
    const selfClosing = /\/\s*$/.test(rest);
    const attributes = selfClosing ? rest.replace(/\/\s*$/, "") : rest;
    if (closing) {
      const open = stack.pop();
      if (open !== name) errors.push(`</${name}> closes <${open}>`);
    } else {
      const leftover = attributes.replace(ATTRIBUTE, "").trim();
      if (leftover) errors.push(`<${name}> has a malformed attribute: "${leftover.slice(0, 40)}"`);
      for (const value of attributes.match(/="[^"]*"/g) || []) {
        if (BARE_AMPERSAND.test(value)) errors.push(`<${name}> attribute has an unescaped "&"`);
      }
      if (!selfClosing) stack.push(name);
    }
    last = match.index + match[0].length;
  }
  if (body.slice(last).includes("<")) errors.push("stray \"<\" after the last tag");
  if (stack.length) errors.push(`unclosed <${stack.join("> <")}>`);
  return errors;
}

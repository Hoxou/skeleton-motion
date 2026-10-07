import assert from "node:assert/strict";
import test from "node:test";
import { transformSync } from "esbuild";
import { componentName, elementName, groupVariants, htmlCode, reactCode } from "../tools/preview-shell/src/exportCode.js";

const variants = [
  { file: "a.light.svg", format: "16:9", height: 900, theme: "light", width: 1600 },
  { file: "a.dark.svg", format: "16:9", height: 900, theme: "dark", width: 1600 },
  { file: "a.4x5.light.svg", format: "4:5", height: 1250, theme: "light", width: 1000 },
  { file: "a.4x5.dark.svg", format: "4:5", height: 1250, theme: "dark", width: 1000 },
];
const svgByFile = Object.fromEntries(variants.map(({ file }) => [file, `<svg xmlns="http://www.w3.org/2000/svg"><title>${file}</title><style>.x{}</style></svg>`]));
const input = { alt: "Insert a step in place.", label: "Insert step", shapes: groupVariants(variants), svgByFile };

test("pairs light and dark files per frame shape, primary shape first", () => {
  assert.deepEqual(groupVariants(variants), [
    { aspect: "16:9", dark: "a.dark.svg", light: "a.light.svg", ratio: 1.7778 },
    { aspect: "4:5", dark: "a.4x5.dark.svg", light: "a.4x5.light.svg", ratio: 0.8 },
  ]);
});

test("a shape with one theme reuses it for the other", () => {
  const [shape] = groupVariants([variants[0]]);
  const code = reactCode({ ...input, shapes: [shape] });
  assert.equal(code.match(/a\.light\.svg/g).length, 2);
});

test("names are valid JavaScript and custom-element identifiers", () => {
  assert.equal(componentName("Insert step"), "InsertStep");
  assert.equal(componentName("3D orbit"), "Motion3dOrbit");
  assert.equal(elementName("Insert step"), "skeleton-motion-insert-step");
});

test("the React export compiles and inlines every variant", () => {
  const code = reactCode(input);
  assert.doesNotThrow(() => transformSync(code, { jsx: "automatic", loader: "jsx" }));
  for (const file of Object.keys(svgByFile)) assert.match(code, new RegExp(file.replace(/\./g, "\\.")));
  assert.match(code, /export default function InsertStep\(/);
});

test("the HTML export never closes its script early", () => {
  const code = htmlCode(input);
  const script = code.slice(code.indexOf("<script type=\"module\">") + 22, code.lastIndexOf("</script>"));
  assert.doesNotMatch(script, /<\//);
  assert.doesNotThrow(() => transformSync(script, { loader: "js" }));
  assert.match(code, /<skeleton-motion-insert-step theme="auto"/);
});

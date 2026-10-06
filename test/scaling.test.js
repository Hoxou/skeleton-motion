import assert from "node:assert/strict";
import test from "node:test";
import { planScene } from "../src/plan.js";
import { __testing, renderSvg } from "../src/render-svg.js";

const { STROKE_ROLES } = __testing;

const analysis = {
  concepts: {
    evidence: [{ file: "scenario-canvas.tsx", kind: "flow", score: 80 }],
    ranked: [{ kind: "flow", score: 80 }],
  },
  palettes: {
    light: { accent: "#142ce3", background: "#fff", border: "#e5e7eb", foreground: "#171717", muted: "#f4f4f5", mutedForeground: "#71717a", radius: "8px", surface: "#fff" },
  },
  slug: "scale",
  source: { input: "/repo", type: "repository" },
  typography: {},
  visual: { backdrop: "dots" },
};

function render(concept, width = 720, height = 405) {
  return renderSvg(planScene(analysis, { concept, duration: 5, height, width }, "light"));
}

function viewBoxWidth(svg) {
  return Number(svg.match(/viewBox="0 0 (\d+) \d+"/)[1]);
}

// Resolves the cascade the browser applies when the SVG is drawn at `width` CSS px.
function activeVariables(svg, width) {
  const rules = [...svg.matchAll(/@media \(min-width: ([\d.]+)px\) \{\s*:root \{([^}]*)\}/g)]
    .map(([, min, body]) => ({ body, min: Number(min) }))
    .filter((rule) => rule.min <= width);
  assert.ok(rules.length > 0, `no size tier covers ${width}px`);
  const body = rules.at(-1).body;
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([\d.]+)/g)].map(([, key, value]) => [key, Number(value)]));
}

function renderedPx(svg, role, width) {
  return activeVariables(svg, width)[`--line-${role}`] * width / viewBoxWidth(svg);
}

test("strokes scale with the artwork instead of staying fixed in screen pixels", () => {
  const svg = render("flow");

  assert.doesNotMatch(svg, /non-scaling-stroke/);
  assert.ok(renderedPx(svg, "hair", 300) < renderedPx(svg, "hair", 720));
  assert.ok(renderedPx(svg, "hair", 720) < renderedPx(svg, "hair", 1600));
});

test("rendered stroke widths stay inside readable bounds at every display size", () => {
  for (const concept of ["flow", "list", "editor", "dashboard"]) {
    const svg = render(concept);
    for (const width of [180, 240, 320, 420, 560, 720, 960, 1280, 1600, 2400]) {
      for (const [role, { max, min }] of Object.entries(STROKE_ROLES)) {
        const px = renderedPx(svg, role, width);
        assert.ok(px >= min - 0.01 && px <= max + 0.01, `${concept} ${role} at ${width}px renders ${px.toFixed(2)}px`);
      }
    }
  }
});

test("assets with different artboards render matching outlines at the same display size", () => {
  const flow = render("flow");
  const runAnalysis = structuredClone(analysis);
  runAnalysis.concepts.evidence = [{ file: "automations/runs/run-step-canvas.tsx", kind: "flow", score: 80 }];
  const list = renderSvg(planScene(runAnalysis, { concept: "flow", duration: 5, height: 405, width: 720 }, "light"));

  assert.notEqual(viewBoxWidth(flow), viewBoxWidth(list));
  for (const width of [320, 720, 1280]) {
    assert.ok(Math.abs(renderedPx(flow, "hair", width) - renderedPx(list, "hair", width)) < 0.05);
  }
});

test("every outline uses a size-aware stroke role", () => {
  for (const concept of ["flow", "list", "editor", "dashboard"]) {
    const svg = render(concept);
    const stroked = [...svg.matchAll(/<(rect|path|circle|line)\b[^>]*\bstroke="var\(--(border|border-strong|accent|cursor-outline)\)"[^>]*>/g)].map(([tag]) => tag);
    const unclassed = stroked.filter((tag) => !/class="[^"]*\bln-/.test(tag));
    assert.deepEqual(unclassed, [], `${concept} has strokes without a size role`);
    assert.doesNotMatch(svg, /stroke-width="[\d.]+"/, `${concept} hardcodes a stroke width`);
  }
});

test("compact sizes drop fine detail and keep the cursor legible", () => {
  const svg = render("flow");
  const compact = svg.match(/@media \(max-width: ([\d.]+)px\) \{([^@]*)\}/);

  assert.ok(compact, "missing compact level-of-detail rule");
  assert.match(compact[2], /\.lod-fine[^{]*\{\s*display: none/);
  assert.match(svg, /class="[^"]*\blod-fine/);
  const cursorAt = (width) => activeVariables(svg, width)["--cursor-scale"] * 25 * width / viewBoxWidth(svg);
  assert.ok(cursorAt(240) >= 13.9, `cursor renders ${cursorAt(240).toFixed(1)}px tall at 240px`);
  assert.ok(cursorAt(2400) <= 30.1, `cursor renders ${cursorAt(2400).toFixed(1)}px tall at 2400px`);
});

test("non-browser renderers fall back to the tier for the requested size", () => {
  const small = render("flow", 360, 203);
  const large = render("flow", 1600, 900);
  const fallback = (svg) => Number(svg.match(/:root \{[^}]*--line-hair:\s*([\d.]+)/)[1]);

  assert.ok(fallback(small) * 360 / 720 < fallback(large) * 1600 / 720);
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeSource, __testing } from "../src/analyze.js";

test("extracts separate light and dark semantic tokens", () => {
  const css = `
    /* Values live in :root and .dark; this comment must not be mistaken for a selector. */
    @theme inline { --color-primary: var(--primary); }
    :root { --background: #fff; --card: #fefefe; --primary: #142ce3; --radius: 0rem; }
    .dark { --background: #111; --card: #222; --primary: #586df7; }
  `;
  const light = __testing.parseVariables(__testing.findBlock(css, ":root"));
  const dark = __testing.parseVariables(__testing.findBlock(css, ".dark"));
  const palettes = __testing.buildPalette(light, dark);

  assert.equal(palettes.light.accent, "#142ce3");
  assert.equal(palettes.dark.accent, "#586df7");
  assert.equal(palettes.light.radius, "0rem");
  assert.equal(palettes.dark.surface, "#222");
  assert.deepEqual(__testing.themeSupport(dark), { dark: "source", light: "source" });
});

test("infers a readable product font from Next font imports", () => {
  const typography = __testing.inferTypography("", `import { DM_Sans, Geist_Mono } from "next/font/google";`);

  assert.equal(typography.family, "DM Sans");
  assert.match(typography.stack, /^"DM Sans"/);
});

test("only selects a dotted backdrop when the source contains that treatment", () => {
  assert.equal(__testing.inferBackdrop(`<Background variant={BackgroundVariant.Dots} />`), "dots");
  assert.equal(__testing.inferBackdrop(`<ReactFlow nodes={nodes} edges={edges} />`), "none");
  assert.equal(__testing.inferBackdrop(`<div class="border-dotted bg-[radial-gradient(circle,white,transparent)]">`), "none");
});

test("detects a voice-first product story", () => {
  assert.equal(__testing.inferFeatures("Create and update tasks with voice commands.").voice, true);
  assert.equal(__testing.inferFeatures("Drag tasks between project columns.").voice, false);
});

test("builds multicolor roles from color families actually used by a page", () => {
  const css = `
    :root {
      --color-blue-600: #2563eb; --color-blue-100: #dbeafe;
      --color-purple-600: #9333ea; --color-purple-100: #f3e8ff;
      --color-teal-600: #0d9488; --color-teal-100: #ccfbf1;
      --color-amber-600: #d97706; --color-amber-50: #fffbeb; --color-amber-100: #fef3c7;
    }
  `;
  const source = "bg-blue-600 text-blue-600 bg-purple-600 text-purple-600 bg-teal-600 text-teal-600 bg-amber-600 text-amber-600";
  const colors = __testing.inferColorSystem(source, css);
  const palettes = __testing.buildPalette({ primary: "#1d4ed8" }, {}, colors);

  assert.equal(colors.mode, "multicolor");
  assert.deepEqual(colors.families, ["amber", "blue", "purple", "teal"]);
  assert.equal(palettes.light.accents.length, 4);
  assert.equal(palettes.light.pastels.length, 4);
  assert.equal(palettes.light.canvas, "#fffbeb");
  assert.ok(palettes.dark.accents.includes("#d97706"));
  assert.ok(palettes.dark.pastels.every((color, index) => color.includes(`${palettes.dark.accents[index]} 22%`)));
});

test("derives a restrained dark theme only when the source has none", () => {
  const palettes = __testing.buildPalette({ primary: "#2563eb", background: "#fff", card: "#fff" }, {});

  assert.deepEqual(__testing.themeSupport({}), { dark: "derived", light: "source" });
  assert.equal(palettes.dark.background, "#111113");
  assert.equal(palettes.dark.surface, "#202024");
  assert.match(palettes.dark.accent, /#2563eb 78%/);
});

test("ranks a reachable automation canvas as a flow concept", async (context) => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "skeleton-motion-test-"));
  context.after(() => fs.rm(fixture, { force: true, recursive: true }));
  await fs.mkdir(path.join(fixture, "app"));
  await fs.writeFile(path.join(fixture, "app", "globals.css"), `
    :root { --background: #fff; --card: #fff; --primary: #142ce3; --radius: 0rem; }
    .dark { --background: #111; --card: #222; --primary: #586df7; }
  `);
  await fs.writeFile(path.join(fixture, "app", "scenario-canvas.tsx"), `
    import { Background, BackgroundVariant, ReactFlow } from "@xyflow/react";
    export function ScenarioCanvas() { return <ReactFlow nodes={nodes} edges={edges} onNodeClick={selectStep}><Background variant={BackgroundVariant.Dots} /></ReactFlow>; }
  `);
  await fs.writeFile(path.join(fixture, "app", "button.test.tsx"), `export const Button = () => <button>ok</button>`);
  await fs.mkdir(path.join(fixture, "docs", "research"), { recursive: true });
  await fs.writeFile(path.join(fixture, "docs", "research", "palette.md"), `
    bg-red-600 text-red-600 bg-purple-600 text-purple-600 bg-teal-600 text-teal-600 bg-amber-600 text-amber-600
  `);

  const analysis = await analyzeSource(fixture);
  assert.equal(analysis.concepts.ranked[0].kind, "flow");
  assert.equal(analysis.palettes.dark.accent, "#586df7");
  assert.equal(analysis.visual.backdrop, "dots");
  assert.equal(analysis.colorSystems.flow.mode, "monochrome");
});

test("analyzes a webpage URL without running page scripts", async (context) => {
  const server = http.createServer((request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<!doctype html><title>Example Flow</title><style>
      :root { --background: #fff; --card: #fafafa; --primary: #1234ff; }
      .dark { --background: #101010; --card: #202020; --primary: #7890ff; }
    </style><main>Workflow canvas nodes and automation steps</main><script>throw new Error("must not execute")</script>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address();
  const analysis = await analyzeSource(`http://127.0.0.1:${address.port}`);

  assert.equal(analysis.name, "Example Flow");
  assert.equal(analysis.palettes.light.accent, "#1234ff");
  assert.equal(analysis.palettes.dark.accent, "#7890ff");
  assert.equal(analysis.concepts.ranked[0].kind, "flow");
});

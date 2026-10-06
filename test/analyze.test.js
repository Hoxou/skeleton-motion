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
});

test("infers a readable product font from Next font imports", () => {
  const typography = __testing.inferTypography("", `import { DM_Sans, Geist_Mono } from "next/font/google";`);

  assert.equal(typography.family, "DM Sans");
  assert.match(typography.stack, /^"DM Sans"/);
});

test("only selects a dotted backdrop when the source contains that treatment", () => {
  assert.equal(__testing.inferBackdrop(`<Background variant={BackgroundVariant.Dots} />`), "dots");
  assert.equal(__testing.inferBackdrop(`<ReactFlow nodes={nodes} edges={edges} />`), "none");
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

  const analysis = await analyzeSource(fixture);
  assert.equal(analysis.concepts.ranked[0].kind, "flow");
  assert.equal(analysis.palettes.dark.accent, "#586df7");
  assert.equal(analysis.visual.backdrop, "dots");
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

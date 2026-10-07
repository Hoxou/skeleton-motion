#!/usr/bin/env node
// Offline evaluation of the AI story designer. Runs the hosted design
// pipeline on saved page contexts, renders every story, scores how varied
// each set is, and writes a contact sheet to compare runs side by side.
//
//   GEMINI_API_KEY=... node scripts/eval-design.mjs [--runs 2] [--only stripe,linear] [--out eval-out/name]
//   node scripts/eval-design.mjs --replay eval-out/name/results.json   (re-render saved plans, no key)
//
// Every model request and reply is saved next to the renders, so prompt
// changes can be judged on real output instead of guesses.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeSource } from "../src/analyze.js";
import { parseArgs } from "../src/args.js";
import { generateCollection } from "../src/generate.js";
import { designStories, fingerprint } from "../worker/ai/design.js";
import { geminiProvider, openAiCompatibleProvider } from "../worker/ai/providers.js";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const flags = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, all) => {
  if (arg.startsWith("--")) pairs.push([arg.slice(2), all[index + 1]?.startsWith("--") ? true : all[index + 1] ?? true]);
  return pairs;
}, []));

function recordingProvider(provider, log) {
  return {
    get label() {
      return provider.label;
    },
    async json(request) {
      const started = Date.now();
      try {
        const reply = await provider.json(request);
        log.push({ ms: Date.now() - started, reply: reply.data, request, usage: reply.usage });
        return reply;
      } catch (error) {
        log.push({ error: error.message, ms: Date.now() - started, request });
        throw error;
      }
    },
  };
}

function providerFromEnvironment() {
  const variables = process["env"];
  if (variables.GEMINI_API_KEY) return geminiProvider({ key: variables.GEMINI_API_KEY, model: variables.GEMINI_MODEL || undefined });
  if (variables.OPENAI_API_KEY) return openAiCompatibleProvider({ baseUrl: variables.OPENAI_BASE_URL, key: variables.OPENAI_API_KEY, model: variables.OPENAI_MODEL || "gpt-5.4-nano" });
  throw new Error("Set GEMINI_API_KEY (or OPENAI_API_KEY) to run the designer, or pass --replay results.json.");
}

// A brand-neutral palette so runs compare on motion, not on color luck.
async function sampleAnalysis() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sm-eval-"));
  await fs.mkdir(path.join(dir, "app"));
  await fs.writeFile(path.join(dir, "app", "globals.css"), ":root { --primary: #635bff; --background: #ffffff; --radius: 10px; --measured-accent-1: #00d4ff; --measured-accent-2: #ff5996; --measured-accent-3: #ffb800; } .dark { --background: #0b0d12; --foreground: #f5f6f8; }");
  await fs.writeFile(path.join(dir, "app", "page.tsx"), "export default function Page() { return <main>product</main>; }");
  const analysis = await analyzeSource(dir);
  await fs.rm(dir, { force: true, recursive: true });
  return analysis;
}

const kindsOf = (plan) => Object.values(plan.elements).map((element) => element.kind);
function shapeOf(node) {
  if (typeof node === "string") return "i";
  return `${node.type[0]}(${(node.children || []).map(shapeOf).join("")})`;
}

/** Structural fingerprint: layout shape, kinds, and how the story changes. */
export function signature(story) {
  const plan = story.plan;
  const kinds = [...new Set(kindsOf(plan))].sort().join("+");
  const changes = story.draft ? fingerprint(story.draft) : plan.states.map((state) => (state.pointer ? (state.pointer.drag ? "D" : state.pointer.hover ? "H" : "C") : "-")).join("");
  return `${story.move || "?"}|${shapeOf(plan.states[0].layout)}|${kinds}|${changes}`;
}

function scoreSet(stories) {
  const plans = stories.map((story) => story.plan);
  const signatures = stories.map(signature);
  const labels = plans.flatMap((plan) => Object.values(plan.elements).map((element) => element.label).filter(Boolean));
  return {
    distinctSignatures: new Set(signatures).size,
    distinctRootShapes: new Set(plans.map((plan) => shapeOf(plan.states[0].layout))).size,
    labelsPerStory: Number((labels.length / Math.max(1, plans.length)).toFixed(1)),
    meanElements: Number((plans.reduce((total, plan) => total + kindsOf(plan).length, 0) / Math.max(1, plans.length)).toFixed(1)),
    meanStates: Number((plans.reduce((total, plan) => total + plan.states.length, 0) / Math.max(1, plans.length)).toFixed(1)),
    signatures,
    stories: plans.length,
  };
}

async function render(analysis, site, stories, outDir) {
  const options = parseArgs([analysis.source.input, "--set", "--name", site], "/");
  const result = generateCollection(analysis, options, { stories });
  await fs.mkdir(outDir, { recursive: true });
  await Promise.all(result.files.filter((file) => file.name.endsWith(".svg")).map((file) => fs.writeFile(path.join(outDir, file.name), file.data)));
  return result.files.filter((file) => /\.4x3\.light\.svg$/.test(file.name)).map((file) => file.name);
}

function sheet(runs) {
  const rows = runs.map((run) => `<section><h2>${run.site} <small>run ${run.run} - ${run.error ? `error: ${run.error}` : `${run.score.distinctSignatures}/${run.score.stories} distinct, ${run.score.meanStates} states, ${run.score.meanElements} elements, ${run.calls} calls, ${run.seconds}s`}</small></h2>
    <div class="row">${(run.files || []).map((file, index) => `<figure><img src="${run.dir}/${file}"><figcaption>${run.stories[index]?.label || ""}<br><code>${run.score.signatures[index] || ""}</code></figcaption></figure>`).join("")}</div></section>`).join("\n");
  return `<!doctype html><meta charset="utf-8"><title>Designer eval</title><style>body{font:14px system-ui;margin:24px;background:#f4f5f7}section{margin-bottom:28px}.row{display:flex;gap:16px}figure{margin:0;width:32%;background:#fff;border-radius:10px;padding:8px}img{width:100%}small{color:#667;font-weight:400}code{font-size:11px;color:#556}</style>${rows}`;
}

async function main() {
  const out = path.resolve(flags.out || path.join(root, "eval-out", new Date().toISOString().replace(/[:.]/g, "-")));
  const analysis = await sampleAnalysis();
  const runs = [];

  if (flags.replay) {
    const saved = JSON.parse(await fs.readFile(flags.replay, "utf8"));
    for (const run of saved) {
      if (!run.stories?.length) continue;
      const dir = `${run.site}-${run.run}`;
      runs.push({ ...run, dir, files: await render(analysis, run.site, run.stories, path.join(out, dir)), score: scoreSet(run.stories) });
    }
  } else {
    const provider = providerFromEnvironment();
    const only = typeof flags.only === "string" ? new Set(flags.only.split(",")) : null;
    const contextDir = path.join(root, "scripts", "eval", "contexts");
    const sites = (await fs.readdir(contextDir)).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5)).filter((site) => !only || only.has(site));
    const repeat = Number(flags.runs) || 1;
    await Promise.all(sites.flatMap((site) => Array.from({ length: repeat }, async (_, index) => {
      const context = JSON.parse(await fs.readFile(path.join(contextDir, `${site}.json`), "utf8"));
      const log = [];
      const started = Date.now();
      const dir = `${site}-${index + 1}`;
      const run = { dir, run: index + 1, site };
      try {
        const design = await designStories(recordingProvider(provider, log), { ...context, colors: 4 });
        Object.assign(run, { calls: design.calls, product: design.product, rejected: design.rejected, rejections: design.rejections, stories: design.stories });
        run.files = await render(analysis, site, design.stories, path.join(out, dir));
        run.score = scoreSet(design.stories);
      } catch (error) {
        run.error = error.message;
        run.score = { signatures: [] };
      }
      run.seconds = Math.round((Date.now() - started) / 1000);
      run.tokens = log.reduce((total, entry) => total + (entry.usage?.totalTokenCount ?? entry.usage?.total_tokens ?? 0), 0);
      await fs.mkdir(path.join(out, dir), { recursive: true });
      await fs.writeFile(path.join(out, dir, "calls.json"), `${JSON.stringify(log, null, 1)}\n`);
      runs.push(run);
      console.log(`${dir}: ${run.error || `${run.score.distinctSignatures}/${run.score.stories} distinct, ${run.calls} calls, ${run.tokens} tokens, ${run.seconds}s`}`);
    })));
  }

  runs.sort((a, b) => a.site.localeCompare(b.site) || a.run - b.run);
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, "results.json"), `${JSON.stringify(runs.map(({ files, ...run }) => run), null, 1)}\n`);
  await fs.writeFile(path.join(out, "index.html"), sheet(runs));
  console.log(`\nContact sheet: ${path.join(out, "index.html")}`);
}

await main();

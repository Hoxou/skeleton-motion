import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeSource } from "../src/analyze.js";
import { parseArgs } from "../src/args.js";
import { planKeys } from "../src/compose/plan.js";
import { generateCollection } from "../src/generate.js";
import { validatePlan } from "../src/scene-plan.js";
import { wellFormedErrors } from "./helpers/xml.js";

const fixture = JSON.parse(await fs.readFile(new URL("./fixtures/board-plan.json", import.meta.url), "utf8"));
const copy = () => structuredClone(fixture);

async function sampleAnalysis(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skeleton-motion-plan-"));
  context.after(() => fs.rm(root, { force: true, recursive: true }));
  await fs.mkdir(path.join(root, "app"));
  await fs.writeFile(path.join(root, "app", "globals.css"), ":root { --primary: #5e6ad2; --background: #ffffff; --radius: 8px; } .dark { --background: #08090a; --foreground: #f7f8f8; }");
  await fs.writeFile(path.join(root, "app", "board.tsx"), "export function Board() { return <div className=\"bg-indigo-500 text-indigo-600\">workflow step list</div>; }");
  return { analysis: await analyzeSource(root), root };
}

test("accepts a coherent board story", () => {
  const result = validatePlan(copy());
  assert.deepEqual(result.errors, []);
  assert.equal(result.plan.states.length, 3);
});

const broken = {
  "an unknown element kind": (plan) => { plan.elements["issue-142"].kind = "hologram"; },
  "a state using an undeclared element": (plan) => { plan.states[1].layout.children[0].children.push("ghost"); },
  "an element placed twice in one state": (plan) => { plan.states[0].layout.children[1].children.push("issue-142"); },
  "two identical consecutive states": (plan) => { plan.states[2] = structuredClone(plan.states[1]); },
  "a story with no pointer action": (plan) => { delete plan.states[0].pointer; },
  "a label longer than a few words": (plan) => { plan.elements["issue-142"].label = "A very long label that reads like a sentence"; },
  "too few states": (plan) => { plan.states = plan.states.slice(0, 1); },
  "a panel group pointing at a card": (plan) => { plan.states[0].layout.children[0].id = "issue-133"; },
};

for (const [label, mutate] of Object.entries(broken)) {
  test(`rejects ${label} with a message the model can act on`, () => {
    const plan = copy();
    mutate(plan);
    const result = validatePlan(plan);
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0 && result.errors.every((error) => error.length > 20));
  });
}

test("rejects a column too crowded for the tall frame", () => {
  const plan = copy();
  for (let index = 0; index < 9; index += 1) {
    plan.elements[`extra-${index}`] = { kind: "card", label: `ENG-${200 + index}` };
    plan.states[0].layout.children[0].children.push(`extra-${index}`);
  }
  const result = validatePlan(plan);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /too crowded/);
});

test("strips markup and control characters from model-written text", () => {
  const plan = copy();
  plan.elements["issue-142"].label = "<script>x</script>";
  plan.copy.title = "Ship\u0007 <b>it</b>";
  const result = validatePlan(plan);
  assert.equal(result.ok, true);
  assert.doesNotMatch(result.plan.elements["issue-142"].label, /[<>]/);
  assert.doesNotMatch(result.plan.copy.title, /[<>\u0007]/);
});

test("the pointer holds still whenever the UI changes, except while dragging", () => {
  const plan = validatePlan(copy()).plan;
  const { keys } = planKeys(plan);
  for (let index = 1; index < keys.length; index += 1) {
    const [before, after] = [keys[index - 1], keys[index]];
    if (before.ui === after.ui) continue;
    const dragged = plan.states[before.ui]?.pointer?.drag && before.aim.target === after.aim.target;
    assert.ok(before.aim === after.aim || dragged, `pointer moved during the transition into state ${after.ui}`);
  }
});

test("every story renders well-formed SVG in every frame shape and theme", async (context) => {
  const { analysis, root } = await sampleAnalysis(context);
  const options = parseArgs([root, "--set", "--name", "wellformed"], "/");
  const builtIn = generateCollection(analysis, options);
  const plan = validatePlan(copy()).plan;
  const designed = generateCollection(analysis, options, { stories: [{ copy: plan.copy, id: "move-issue", label: plan.label, plan }] });
  const svgs = [...builtIn.files, ...designed.files].filter((file) => file.name.endsWith(".svg"));
  assert.ok(svgs.length >= 20, `expected every shape and theme, got ${svgs.length}`);
  for (const file of svgs) assert.deepEqual(wellFormedErrors(file.data), [], file.name);
});

test("the well-formedness check catches the bare-attribute bug", () => {
  assert.notDeepEqual(wellFormedErrors("<svg><g data-drag><rect /></g></svg>"), []);
  assert.deepEqual(wellFormedErrors('<svg><g data-drag=""><rect x="1" /></g></svg>'), []);
});

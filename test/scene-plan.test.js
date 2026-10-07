import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeSource } from "../src/analyze.js";
import { parseArgs } from "../src/args.js";
import { __testing, planKeys } from "../src/compose/plan.js";
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

test("a highlight ring traces its element's shape, including while it is pressed", async (context) => {
  const { analysis, root } = await sampleAnalysis(context);
  const options = parseArgs([root, "--set", "--name", "ring"], "/");
  const plan = validatePlan({
    copy: { title: "Pay" },
    elements: { checkout: { kind: "panel", label: "Checkout" }, paid: { kind: "chip", label: "Paid", tone: "tag-2" }, pay: { kind: "button", label: "Pay now" } },
    label: "Pay invoice",
    states: [
      { highlight: ["pay"], layout: { children: ["pay"], id: "checkout", type: "panel" }, pointer: { target: "pay" } },
      { highlight: ["pay", "paid"], layout: { children: ["pay", "paid"], id: "checkout", type: "panel" } },
    ],
  }).plan;
  const designed = generateCollection(analysis, options, { stories: [{ copy: plan.copy, id: "pay", label: plan.label, plan }] });
  const geometry = (rect) => rect.replace(/\s(?:fill|class|stroke|stroke-opacity)="[^"]*"/g, "");
  for (const file of designed.files.filter((entry) => entry.name.endsWith(".svg"))) {
    for (const id of ["pay", "paid"]) {
      const from = file.data.indexOf(`data-plan-id="${id}"`);
      const body = file.data.slice(from).match(/<rect [^>]*>[\s\S]*?<\/rect>/)[0];
      const ring = file.data.slice(from).match(/<rect [^>]*fill="none" class="ln-base"[^>]*>[\s\S]*?<\/rect>/)[0];
      assert.equal(geometry(ring), geometry(body), `${file.name}: ${id}`);
    }
  }
});

const payout = JSON.parse(await fs.readFile(new URL("./fixtures/payout-steps.json", import.meta.url), "utf8"));
const steps = () => structuredClone(payout);

test("steps compile into full states that carry statuses, values, and links forward", () => {
  const { errors, plan } = validatePlan(steps());
  assert.deepEqual(errors, []);
  assert.equal(plan.states.length, 4);
  assert.equal(plan.states[0].status["payout-ana"], "pending");
  assert.deepEqual(plan.states[1].status, { amount: "focused", "payout-ana": "selected" });
  assert.equal(plan.states[1].value.amount, 0.6);
  assert.deepEqual(plan.states[2].links, [["payout-ana", "balance"]]);
  assert.deepEqual(plan.states[3].links, [["payout-ana", "balance"]], "links persist until unlinked");
  assert.deepEqual(plan.states[3].highlight, ["balance"]);
  assert.deepEqual(plan.states[0].pointer, { drag: false, hover: false, target: "amount" });
  assert.equal(plan.states[2].pointer, undefined, "a step without a trigger plays on its own");
});

test("inserts land before, after, or inside a named group, and can grow out of an element", () => {
  const plan = steps();
  plan.elements["payout-new"] = { kind: "row" };
  plan.steps[1].do.push({ from: "approve", id: "payout-new", into: "queue", op: "insert", at: 0 });
  plan.steps[2].do.push({ after: "balance", id: "payout-mo", op: "move" });
  const { errors, plan: compiled } = validatePlan(plan);
  assert.deepEqual(errors, []);
  assert.deepEqual(compiled.states[2].layout.children[0].children.slice(0, 2), ["payout-new", "payout-ana"]);
  assert.deepEqual(compiled.states[2].origin, { "payout-new": "approve" });
  assert.deepEqual(compiled.states[3].layout.children[1].children, ["balance", "payout-mo", "amount", "approve"]);
});

const critic = {
  "a result shown by swapping the button for a chip": (plan) => {
    plan.elements.sent = { kind: "chip", label: "Paid" };
    plan.steps[1].do = [{ id: "approve", op: "remove" }, { id: "sent", into: "side", op: "insert" }];
  },
  "a sparse screen": (plan) => {
    plan.screen.children = [{ children: ["payout-ana"], id: "queue", type: "panel" }, { children: ["approve"], id: "side", type: "column" }];
    plan.steps = [{ by: { click: "approve" }, do: [{ id: "approve", op: "set", state: "done" }] }, { do: [{ id: "payout-ana", op: "set", state: "done" }] }];
  },
  "steps that only add and remove": (plan) => {
    plan.elements.extra = { kind: "row" };
    plan.steps = [{ by: { click: "approve" }, do: [{ id: "extra", into: "queue", op: "insert" }] }, { do: [{ id: "extra", op: "remove" }] }];
  },
  "an unknown op": (plan) => { plan.steps[0].do[0].op = "teleport"; },
  "a move with nowhere to go": (plan) => { plan.steps[0].do.push({ id: "payout-li", op: "move" }); },
  "a single step": (plan) => { plan.steps = plan.steps.slice(0, 1); },
};
for (const [name, mutate] of Object.entries(critic)) {
  test(`rejects ${name}`, () => {
    const plan = steps();
    mutate(plan);
    const result = validatePlan(plan);
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0);
  });
}

test("the swap critique tells the model what to do instead", () => {
  const plan = steps();
  critic["a result shown by swapping the button for a chip"](plan);
  assert.match(validatePlan(plan).errors.join(" "), /\{"op": "set", "id": "approve", "state": "done"\}/);
});

async function renderSteps(context, plan, driver = "user") {
  const { analysis, root } = await sampleAnalysis(context);
  const options = parseArgs([root, "--set", "--name", "steps"], "/");
  const valid = validatePlan(plan, { driver });
  assert.deepEqual(valid.errors, []);
  return generateCollection(analysis, options, { stories: [{ copy: valid.plan.copy, id: "story", label: valid.plan.label, plan: valid.plan }] }).files.filter((file) => file.name.endsWith(".svg"));
}

test("step plans render well-formed SVG with fillers, checks, and connectors", async (context) => {
  const svgs = await renderSteps(context, steps());
  for (const file of svgs) assert.deepEqual(wellFormedErrors(file.data), [], file.name);
  const tall = svgs.find((file) => file.name.includes(".9x16.light"));
  assert.ok((tall.data.match(/data-plan-id="__fill-queue-/g) || []).length >= 2, "a tall frame fills the queue with skeleton rows");
  assert.match(tall.data, /data-plan-id="approve"[^]*?<path d="M[^"]+" fill="none" stroke="#fff"/, "the button turns into a check");
  assert.match(tall.data, /pathLength="1" stroke-dasharray="1 1" fill="none" class="ln-base" stroke="var\(--accent\)"/, "the link draws on");
});

test("the rewind clears results before the layout folds back", () => {
  const { plan } = validatePlan(steps());
  const { keys } = planKeys(plan);
  const revert = keys.findIndex((key) => key.status === 0);
  assert.ok(revert > 0);
  assert.equal(keys[revert].ui, plan.states.length - 1, "results clear while the last layout still shows");
  assert.equal(keys[revert + 1].ui, 0);
});

test("hover triggers dwell without a click", () => {
  const plan = steps();
  plan.steps[0].by = { hover: "amount" };
  const { keys, clicks } = planKeys(validatePlan(plan).plan);
  assert.equal(clicks.length, 1, "only the approve click remains");
  assert.ok(!keys.some((key) => key.pressed === "amount"));
});

test("an inserted element starts as the shape it grows out of", () => {
  const button = { height: 30, width: 80, x: 500, y: 300 };
  const slot = { height: 0, width: 200, x: 100, y: 120 };
  const layouts = {
    base: [{ approve: button }, { approve: button, fresh: { ...slot, height: 46 } }],
    collapsed: () => ({ fresh: slot }),
    origins: [{}, { fresh: "approve" }],
    present: [new Set(["approve"]), new Set(["approve", "fresh"])],
  };
  assert.deepEqual(__testing.viewAt("fresh", { toward: 1, ui: 0 }, layouts, null), { opacity: 0, rect: button });
  layouts.origins[1] = {};
  assert.deepEqual(__testing.viewAt("fresh", { toward: 1, ui: 0 }, layouts, null), { opacity: 0, rect: slot }, "without an origin it opens from its slot");
});

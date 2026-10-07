import { validatePlan } from "../../src/scene-plan.js";
import { ProviderError } from "./providers.js";
import { repairPrompt, SYSTEM_PROMPT, userPrompt } from "./prompt.js";

const WANTED = 3;
const REPAIR_ROUNDS = 2;

function slug(value, taken) {
  const base = String(value || "story").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28) || "story";
  let id = base;
  for (let index = 2; taken.has(id); index += 1) id = `${base}-${index}`;
  taken.add(id);
  return id;
}

/**
 * Asks the model for stories, validates each one, and sends rejected ones
 * back with the validator's messages until they pass or rounds run out.
 * @returns {{ product, stories: Array<{ id, label, copy, plan }>, calls, rejected }}
 */
export async function designStories(provider, context) {
  let calls = 1;
  const first = await provider.json({ system: SYSTEM_PROMPT, user: userPrompt(context) });
  const product = first.data?.product && typeof first.data.product === "object" ? first.data.product : {};
  const drafts = Array.isArray(first.data?.stories) ? first.data.stories.slice(0, WANTED) : [];
  if (drafts.length === 0) throw new ProviderError("bad-output", "The model returned no stories.");

  const accepted = new Array(drafts.length).fill(null);
  let pending = drafts.map((plan, index) => ({ index, plan }));
  for (let round = 0; ; round += 1) {
    const failures = [];
    for (const { index, plan } of pending) {
      const result = validatePlan(plan);
      if (result.ok) accepted[index] = result.plan;
      else failures.push({ errors: result.errors.slice(0, 12), index, plan });
    }
    if (failures.length === 0 || round >= REPAIR_ROUNDS) {
      pending = failures;
      break;
    }
    calls += 1;
    const repaired = await provider.json({ system: SYSTEM_PROMPT, user: repairPrompt(context, failures) }).catch(() => null);
    const fixes = Array.isArray(repaired?.data?.stories) ? repaired.data.stories : [];
    pending = failures.map((failure, position) => ({ index: failure.index, plan: fixes[position] ?? failure.plan }));
  }

  const taken = new Set();
  const stories = accepted.filter(Boolean).map((plan) => ({ copy: plan.copy, id: slug(plan.label, taken), label: plan.label, plan }));
  if (stories.length === 0) throw new ProviderError("bad-output", "The model could not produce a valid animation for this product.");
  return { calls, product, rejected: pending.length, rejections: pending.map((failure) => failure.errors.slice(0, 6)), stories };
}

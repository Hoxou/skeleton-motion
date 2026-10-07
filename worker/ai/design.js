import { validatePlan } from "../../src/scene-plan.js";
import { MOVES } from "./patterns.js";
import { ProviderError } from "./providers.js";
import { BRIEF_PROMPT, BRIEF_SCHEMA, briefPrompt, colorShares, MONOCHROME_SHARE, STORY_PROMPT, STORY_SCHEMA, storyPrompt, storyRepairPrompt, SURFACES } from "./prompt.js";

const WANTED = 3;
const REPAIR_ROUNDS = 2;
// Planning picks from short candidate lists; designing a story needs a little more thought.
const THINKING = { brief: "minimal", story: "low" };
// The whole set's model time. Repairs and redesigns only start while enough
// is left, so a slow provider costs quality, not a hung page.
const BUDGET_MS = 180_000;
const REPAIR_MIN_MS = 25_000;
const REDESIGN_MIN_MS = 40_000;

function slug(value, taken) {
  const base = String(value || "story").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28) || "story";
  let id = base;
  for (let index = 2; taken.has(id); index += 1) id = `${base}-${index}`;
  taken.add(id);
  return id;
}

const clean = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

function normalizeBrief(feature, index) {
  const typical = Number(feature.typical);
  return {
    area: clean(feature.area, 40).toLowerCase(),
    driver: feature.driver === "system" ? "system" : "user",
    move: Object.hasOwn(MOVES, feature.move) ? feature.move : null,
    name: clean(feature.name, 40) || `Feature ${index + 1}`,
    objects: (Array.isArray(feature.objects) ? feature.objects : []).map((object) => clean(object, 40)).filter(Boolean).slice(0, 6),
    surface: Object.hasOwn(SURFACES, feature.surface) ? feature.surface : null,
    typical: Number.isFinite(typical) ? Math.max(0, Math.min(1, typical)) : 0.5,
    what: clean(feature.what, 200),
    words: feature.words === "none" ? "none" : "few",
  };
}

/**
 * Picks the set from the model's candidates: the most typical feature (what
 * the product is known for), then the least typical ones that differ from
 * everything picked in move, surface, and product area. Missing moves or
 * surfaces take unused ones.
 * @param cursor "on" | "off" for the whole set: every story shows the
 *   pointer, or none does. Without it (older replies), at most one story is
 *   system-driven.
 */
export function normalizeBriefs(features, cursor) {
  const pool = (Array.isArray(features) ? features : []).filter((feature) => feature && typeof feature === "object").slice(0, 8).map(normalizeBrief);
  const picked = [];
  const differs = (brief, strict) => picked.every((other) => (!brief.move || brief.move !== other.move) && (!strict || ((!brief.surface || brief.surface !== other.surface) && (!brief.area || brief.area !== other.area))));
  const systemOk = (brief) => cursor !== undefined || brief.driver === "user" || !picked.some((other) => other.driver === "system");
  const core = [...pool].sort((a, b) => b.typical - a.typical)[0];
  if (core) picked.push(core);
  const tail = [...pool].sort((a, b) => a.typical - b.typical);
  for (const strict of [true, false]) {
    for (const brief of tail) {
      if (picked.length >= WANTED) break;
      if (!picked.includes(brief) && differs(brief, strict) && systemOk(brief)) picked.push(brief);
    }
  }
  const used = { move: new Set(), surface: new Set() };
  let worded = false;
  return picked.map(({ typical, ...brief }) => {
    // Wordless skeletons read best; at most one story in a set uses words.
    const words = brief.words === "few" && !worded ? "few" : "none";
    worded ||= words === "few";
    const move = brief.move && !used.move.has(brief.move) ? brief.move : Object.keys(MOVES).find((name) => !used.move.has(name));
    const surface = brief.surface && !used.surface.has(brief.surface) ? brief.surface : Object.keys(SURFACES).find((name) => !used.surface.has(name));
    used.move.add(move);
    used.surface.add(surface);
    const driver = cursor === "off" ? "system" : cursor === "on" ? "user" : brief.driver;
    return { ...brief, driver, move, surface, words };
  });
}

const MAX_LABELS = 2;
// Kinds whose tone shows as a colored dot, avatar, tag, or tile.
const COLORED = new Set(["avatar", "card", "chip", "image", "row"]);

/**
 * Keeps a plan's secondary hues to the brand's own mix: a one-color brand
 * gets none, otherwise about (1 - main share) of the colored elements may
 * carry tag-2 and up, in the order the model listed them. Tones beyond the
 * brand's hues, or over budget, fall back to shades of the main color.
 */
export function budgetColors(plan, colors) {
  const shares = colorShares(colors);
  const colored = Object.values(plan.elements).filter((element) => COLORED.has(element.kind)).length;
  let allowed = shares.length < 2 || shares[0] >= MONOCHROME_SHARE ? 0 : Math.max(1, Math.round(colored * (1 - shares[0])));
  const elements = Object.fromEntries(Object.entries(plan.elements).map(([id, element]) => {
    const hue = Number(/^tag-([2-4])$/.exec(element.tone || "")?.[1]);
    if (!hue) return [id, element];
    if (hue <= shares.length && allowed > 0) {
      allowed -= 1;
      return [id, element];
    }
    const { tone, ...rest } = element;
    return [id, rest];
  }));
  return { ...plan, elements };
}

/**
 * Caps a validated plan's labels to what the brief allows: none at all, or
 * the two that matter most (the button, then the storyboard's focus).
 */
export function limitWords(plan, words, focus) {
  const keep = new Set();
  if (words === "few") {
    const labeled = Object.entries(plan.elements).filter(([, element]) => element.label).map(([id, element]) => ({ element, id }));
    const rank = ({ element, id }) => (element.kind === "button" ? 0 : id === focus ? 1 : 2);
    for (const { id } of labeled.sort((a, b) => rank(a) - rank(b)).slice(0, MAX_LABELS)) keep.add(id);
  }
  const elements = Object.fromEntries(Object.entries(plan.elements).map(([id, element]) => {
    if (!element.label || keep.has(id)) return [id, element];
    const { label, ...rest } = element;
    return [id, rest];
  }));
  return { ...plan, elements };
}

// What kind of change a draft makes and how it is triggered; two stories
// with the same fingerprint read as the same animation.
export function fingerprint(draft) {
  const steps = Array.isArray(draft?.steps) ? draft.steps : [];
  const ops = [...new Set(steps.flatMap((step) => (Array.isArray(step?.do) ? step.do : []).map((change) => `${change?.op}${change?.state ? `:${change.state}` : ""}`)))].sort();
  const triggers = steps.map((step) => Object.keys(step?.by || {})[0] || "auto").join(",");
  return `${ops.join("+")}|${triggers}`;
}

/**
 * Designs one story in its own conversation, repairing it with the
 * validator's messages until it passes or rounds run out. `retry` starts
 * from a previous draft and the reasons it must change.
 * @returns {{ calls, draft, plan } | { calls, errors, failure, plan: null }}
 *   `failure` is the last provider error, if a call failed outright.
 */
async function designStory(provider, context, input, retry = null) {
  const options = { driver: input.brief.driver };
  let calls = 1;
  let failure = null;
  let schema = STORY_SCHEMA;
  const ask = (user) => provider.json({ schema, system: STORY_PROMPT, thinking: THINKING.story, user }).catch((error) => {
    failure = error;
    return null;
  });
  let reply = await ask(retry ? storyRepairPrompt(context, input, retry) : storyPrompt(context, input));
  for (let round = 0; ; round += 1) {
    const draft = reply?.data?.plan ?? reply?.data ?? null;
    // A provider that accepts a schema but answers with an empty shell is
    // asked again without it.
    if (draft && (!draft.screen || !draft.elements || Object.keys(draft.elements).length === 0)) schema = null;
    const result = validatePlan(draft, options);
    if (result.ok) return { calls, draft, plan: budgetColors(limitWords(result.plan, input.brief.words, String(draft?.storyboard?.focus ?? "")), context.colors) };
    const errors = result.errors.slice(0, 12);
    if (round >= REPAIR_ROUNDS || provider.remaining() < REPAIR_MIN_MS) return { calls, errors, failure, plan: null };
    calls += 1;
    reply = await ask(storyRepairPrompt(context, input, { errors, plan: draft }));
  }
}

/**
 * Plans candidate features, picks three different ones, then designs each
 * story independently and in parallel so no story is written while looking
 * at another. A story that still works like a sibling is redesigned once.
 * @returns {{ product, stories: Array<{ id, label, copy, plan, move, surface }>, calls, rejected, rejections, timings }}
 *   `timings` lists each model call's duration in ms, in completion order.
 */
export async function designStories(source, context, { budgetMs = BUDGET_MS } = {}) {
  const timings = [];
  const deadline = Date.now() + budgetMs;
  const provider = {
    get label() {
      return source.label;
    },
    remaining: () => deadline - Date.now(),
    async json(options) {
      const started = Date.now();
      try {
        return await source.json({ ...options, deadline });
      } finally {
        timings.push(Date.now() - started);
      }
    },
  };
  const first = await provider.json({ schema: BRIEF_SCHEMA, system: BRIEF_PROMPT, thinking: THINKING.brief, user: briefPrompt(context) });
  const product = first.data?.product && typeof first.data.product === "object" ? first.data.product : {};
  const cursor = ["on", "off"].includes(first.data?.cursor) ? first.data.cursor : undefined;
  const briefs = normalizeBriefs(first.data?.candidates ?? first.data?.features, cursor);
  if (briefs.length === 0) throw new ProviderError("bad-output", "The model returned no features to animate.");

  const inputs = briefs.map((brief) => ({ brief, others: briefs.filter((other) => other !== brief), product }));
  const results = await Promise.all(inputs.map((input) => designStory(provider, context, input)));
  let calls = 1 + results.reduce((total, result) => total + result.calls, 0);

  const seen = new Map();
  for (const [index, result] of results.entries()) {
    if (!result.plan) continue;
    const mark = fingerprint(result.draft);
    if (!seen.has(mark)) {
      seen.set(mark, index);
      continue;
    }
    if (provider.remaining() < REDESIGN_MIN_MS) continue;
    const twin = results[seen.get(mark)].plan.label;
    const errors = [`This plan works like the "${twin}" animation in the same set: the same kind of change, triggered the same way. Follow this brief's own move with different changes and another screen layout.`];
    const redo = await designStory(provider, context, inputs[index], { errors, plan: result.draft });
    calls += redo.calls;
    if (redo.plan && fingerprint(redo.draft) !== mark) results[index] = redo;
  }

  const taken = new Set();
  const stories = results.flatMap((result, index) => (result.plan ? [{ copy: result.plan.copy, id: slug(result.plan.label, taken), label: result.plan.label, move: briefs[index].move, plan: result.plan, surface: briefs[index].surface }] : []));
  if (stories.length === 0) {
    // A key or quota problem says more than "no valid animation".
    const cause = results.map((result) => result.failure).find((error) => error instanceof ProviderError && error.kind !== "bad-output");
    throw cause ?? new ProviderError("bad-output", "The model could not produce a valid animation for this product.");
  }
  const failures = results.filter((result) => !result.plan);
  return {
    calls,
    product,
    rejected: failures.length,
    // Provider errors are kind and status only; their text is never kept.
    rejections: failures.map((failure) => [...(failure.failure ? [`provider ${failure.failure.kind} ${failure.failure.status || ""}`.trim()] : []), ...failure.errors.slice(0, 6)]),
    stories,
    timings,
  };
}

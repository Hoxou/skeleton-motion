import { idsIn, KINDS, layoutTree } from "./compose/plan.js";
import { FORMATS, frameFor } from "./layout/formats.js";

// Scene plans come from a language model, so everything here treats the plan
// as untrusted input: unknown fields are dropped, text is trimmed, and every
// problem is reported as a sentence the model can act on in a repair turn.

export const LIMITS = Object.freeze({ elements: 16, label: 22, states: [2, 5] });
const ID = /^[a-z][a-z0-9-]{0,31}$/;
const TONES = new Set(["accent", "neutral", "tag-1", "tag-2", "tag-3", "tag-4"]);
const GAPS = new Set(["tight", "normal", "loose"]);
const GROUPS = new Set(["row", "column", "panel"]);
// Control characters and markup never belong in a short product label.
const UNSAFE_TEXT = /[\u0000-\u001f\u007f<>]/g;

function cleanText(value, max) {
  return String(value ?? "").replace(UNSAFE_TEXT, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeNode(node, errors, where) {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") {
    errors.push(`${where}: each layout entry must be an element id or a {type, children} group.`);
    return null;
  }
  if (node.type === "item") return { grow: Boolean(node.grow), id: String(node.id ?? ""), type: "item" };
  if (!GROUPS.has(node.type)) {
    errors.push(`${where}: unknown layout type "${node.type}". Use "row", "column", "panel", or an element id.`);
    return null;
  }
  const children = Array.isArray(node.children) ? node.children.map((child, index) => normalizeNode(child, errors, `${where}.children[${index}]`)).filter((child) => child !== null) : [];
  const out = { children, type: node.type };
  if (GAPS.has(node.gap)) out.gap = node.gap;
  if (node.type === "panel") {
    out.id = String(node.id ?? "");
    out.direction = node.direction === "row" ? "row" : "column";
  }
  return out;
}

/**
 * Normalizes and checks a model-authored plan.
 * @returns {{ ok: boolean, errors: string[], plan: object | null }}
 *   `errors` are written for the model; `plan` is the cleaned plan when ok.
 */
export function validatePlan(input) {
  const errors = [];
  if (!input || typeof input !== "object") return { errors: ["The plan must be a JSON object."], ok: false, plan: null };

  const elements = {};
  const entries = input.elements && typeof input.elements === "object" ? Object.entries(input.elements) : [];
  if (entries.length === 0) errors.push("Add an \"elements\" object mapping ids to {kind, label}.");
  if (entries.length > LIMITS.elements) errors.push(`Use at most ${LIMITS.elements} elements; this plan has ${entries.length}. Keep only what the story needs.`);
  for (const [id, element] of entries.slice(0, LIMITS.elements)) {
    if (!ID.test(id)) {
      errors.push(`Element id "${cleanText(id, 40)}" must be lowercase letters, digits, and dashes, starting with a letter.`);
      continue;
    }
    if (!element || !Object.hasOwn(KINDS, element.kind)) {
      errors.push(`Element "${id}" needs a kind from: ${Object.keys(KINDS).join(", ")}.`);
      continue;
    }
    const label = cleanText(element.label, LIMITS.label);
    if (String(element.label ?? "").length > LIMITS.label) errors.push(`Element "${id}" label is too long; keep labels to ${LIMITS.label} characters (a word or two from the product).`);
    elements[id] = { kind: element.kind, ...(label ? { label } : {}), ...(TONES.has(element.tone) ? { tone: element.tone } : {}) };
  }

  const rawStates = Array.isArray(input.states) ? input.states : [];
  const [minStates, maxStates] = LIMITS.states;
  if (rawStates.length < minStates || rawStates.length > maxStates) errors.push(`Use ${minStates} to ${maxStates} states; this plan has ${rawStates.length}.`);
  const states = rawStates.slice(0, maxStates).map((state, index) => {
    const where = `states[${index}]`;
    const layout = normalizeNode(state?.layout, errors, `${where}.layout`);
    const out = { highlight: [], layout: layout && typeof layout === "object" ? layout : { children: layout ? [layout] : [], type: "column" } };
    if (Array.isArray(state?.highlight)) out.highlight = state.highlight.map(String).filter((id) => elements[id]);
    if (state?.pointer?.target) out.pointer = { drag: Boolean(state.pointer.drag), target: String(state.pointer.target) };
    return out;
  });

  states.forEach((state, index) => {
    const where = `states[${index}]`;
    const ids = idsIn(state.layout);
    const seen = new Set();
    for (const id of ids) {
      if (!elements[id]) errors.push(`${where} uses "${id}", which is not in "elements".`);
      if (seen.has(id)) errors.push(`${where} places "${id}" twice; each element appears at most once per state.`);
      seen.add(id);
    }
    const walk = (node) => {
      if (typeof node === "string" || node.type === "item") return;
      if (node.type === "panel" && elements[node.id]?.kind !== "panel") errors.push(`${where}: panel group "${node.id}" must reference an element of kind "panel".`);
      node.children.forEach(walk);
    };
    walk(state.layout);
    if (ids.length === 0) errors.push(`${where} is empty; every state shows the product UI.`);
    if (state.pointer && !seen.has(state.pointer.target)) errors.push(`${where}.pointer.target "${state.pointer.target}" must be an element shown in that state.`);
  });

  for (let index = 1; index < states.length; index += 1) {
    const before = states[index - 1];
    const after = states[index];
    if (JSON.stringify(before.layout) === JSON.stringify(after.layout) && JSON.stringify(before.highlight) === JSON.stringify(after.highlight)) {
      errors.push(`states[${index}] is identical to states[${index - 1}]; each step must change something (an item enters, leaves, moves, or is highlighted).`);
    }
  }
  if (!states.slice(0, -1).some((state) => state.pointer)) errors.push("At least one state needs a pointer.target: the action the viewer watches.");

  const plan = {
    copy: {
      description: cleanText(input.copy?.description, 140),
      eyebrow: cleanText(input.copy?.eyebrow, 28),
      title: cleanText(input.copy?.title, 48),
    },
    elements,
    label: cleanText(input.label, 32) || "Product motion",
    states,
  };

  // Only lay out a structurally sound plan; otherwise the messages above are
  // the useful ones.
  if (errors.length === 0) {
    for (const format of Object.values(FORMATS)) {
      const frame = frameFor(format);
      states.forEach((state, index) => {
        const { issues } = layoutTree(state.layout, frame.safe, plan, frame);
        for (const path of issues) errors.push(`In the ${format.id} frame, states[${index}] is too crowded at ${path}: show fewer items there or move some into another group.`);
      });
    }
  }

  return { errors: [...new Set(errors)], ok: errors.length === 0, plan: errors.length === 0 ? plan : null };
}

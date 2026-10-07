import { idsIn, KINDS, layoutTree } from "./compose/plan.js";
import { FORMATS, frameFor } from "./layout/formats.js";

// Scene plans come from a language model, so everything here treats the plan
// as untrusted input: unknown fields are dropped, text is trimmed, and every
// problem is reported as a sentence the model can act on in a repair turn.
//
// Two authoring shapes compile to the same internal plan:
// - steps (preferred): an opening `screen` plus `steps`, each a trigger and a
//   few changes (insert, remove, move, set, link, highlight). The model only
//   says what changes; the engine owns how it moves.
// - states (legacy): one full layout per state; kept so stored plans render.
// The internal plan is a list of states, each with a full layout plus the
// element statuses, values, links, and insert origins in effect.

export const LIMITS = Object.freeze({ elements: 16, label: 22, states: [2, 5], steps: [2, 4] });
export const STATUSES = Object.freeze(["idle", "pending", "done", "error", "selected", "focused", "on", "dim"]);
export const OPS = Object.freeze(["insert", "remove", "move", "set", "link", "unlink", "highlight"]);
export const TONE_NAMES = Object.freeze(["accent", "neutral", "tag-1", "tag-2", "tag-3", "tag-4"]);
const ID = /^[a-z][a-z0-9-]{0,31}$/;
const TONES = new Set(TONE_NAMES);
const GAPS = new Set(["tight", "normal", "loose"]);
const GROUPS = new Set(["row", "column", "panel"]);
const TRIGGERS = Object.freeze(["click", "drag", "hover"]);
// Control characters and markup never belong in a short product label.
const UNSAFE_TEXT = /[\u0000-\u001f\u007f<>]/g;

function cleanText(value, max) {
  return String(value ?? "").replace(UNSAFE_TEXT, "").replace(/\s+/g, " ").trim().slice(0, max);
}

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value)));

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
  } else if (typeof node.id === "string" && ID.test(node.id)) {
    // A named row or column, so steps can insert into it.
    out.id = node.id;
  }
  return out;
}

const cloneTree = (node) => (typeof node === "string" || node.type === "item" ? (typeof node === "string" ? node : { ...node }) : { ...node, children: node.children.map(cloneTree) });
const nodeId = (node) => (typeof node === "string" ? node : node.id);

// The group holding `id` (an item or a group) and its index there.
function locate(node, id) {
  if (typeof node === "string" || node.type === "item") return null;
  for (let index = 0; index < node.children.length; index += 1) {
    if (nodeId(node.children[index]) === id) return { group: node, index };
    const found = locate(node.children[index], id);
    if (found) return found;
  }
  return null;
}

function findGroup(node, id) {
  if (typeof node === "string" || node.type === "item") return null;
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findGroup(child, id);
    if (found) return found;
  }
  return null;
}

function groupIds(node) {
  if (typeof node === "string" || node.type === "item") return [];
  return [...(node.type !== "panel" && node.id ? [node.id] : []), ...node.children.flatMap(groupIds)];
}

// Where an insert or move lands: next to a sibling, or inside a group. An
// insert that names no place lands after what it grows from, else after the
// step's previous insert, else at the end of the screen.
function slotFor(layout, op, where, errors, fallback = null) {
  for (const side of ["before", "after"]) {
    if (op[side] === undefined) continue;
    const found = locate(layout, String(op[side]));
    if (!found) {
      errors.push(`${where}: "${side}": "${cleanText(op[side], 40)}" is not on screen at this step.`);
      return null;
    }
    return { group: found.group, index: found.index + (side === "after" ? 1 : 0) };
  }
  if (op.into !== undefined) {
    const group = findGroup(layout, String(op.into));
    if (!group) {
      errors.push(`${where}: "into": "${cleanText(op.into, 40)}" must be a panel or a named row/column on screen at this step.`);
      return null;
    }
    const at = Number.isInteger(op.at) ? Math.max(0, Math.min(group.children.length, op.at)) : group.children.length;
    return { group, index: at };
  }
  if (fallback) {
    const anchor = [op.from, fallback.previous].map((id) => (id === undefined ? null : locate(layout, String(id)))).find(Boolean);
    return anchor ? { group: anchor.group, index: anchor.index + 1 } : { group: layout, index: layout.children.length };
  }
  errors.push(`${where}: say where it goes with "into" (a panel or named group), "before", or "after" (a sibling id).`);
  return null;
}

function triggerOf(by) {
  if (!by || typeof by !== "object") return null;
  for (const name of TRIGGERS) {
    if (by[name] !== undefined) return { drag: name === "drag", hover: name === "hover", target: String(by[name]) };
  }
  return null;
}

/**
 * Applies one step's changes to the previous state. Returns the next state
 * and records which element ids the step inserted and removed.
 */
function applyStep(previous, step, elements, errors, where) {
  const layout = cloneTree(previous.layout);
  const next = { highlight: [], layout, links: [...previous.links], origin: {}, status: { ...previous.status }, value: { ...previous.value } };
  const changes = Array.isArray(step?.do) ? step.do : [];
  const record = { inserted: [], ops: [], removed: [] };
  if (changes.length === 0) errors.push(`${where}.do: list at least one change.`);
  changes.slice(0, 6).forEach((op, index) => {
    const at = `${where}.do[${index}]`;
    if (!op || !OPS.includes(op.op)) {
      errors.push(`${at}: "op" must be one of ${OPS.join(", ")}.`);
      return;
    }
    record.ops.push(op.op);
    const id = String(op.id ?? "");
    const declared = (value) => Object.hasOwn(elements, value);
    const onScreen = (value) => idsIn(layout).includes(value);
    if (["insert", "remove", "move", "set", "highlight"].includes(op.op) && !declared(id)) {
      errors.push(`${at}: "id" "${cleanText(id, 40)}" is not declared in "elements".`);
      return;
    }
    // Inserting what is already on screen can only mean moving it there.
    if (op.op === "insert" && onScreen(id)) op = { ...op, op: "move" };
    if (op.op === "insert") {
      const slot = slotFor(layout, op, at, errors, { previous: record.inserted.at(-1) });
      if (!slot) return;
      slot.group.children.splice(slot.index, 0, elements[id].kind === "panel" ? { children: [], direction: "column", id, type: "panel" } : id);
      record.inserted.push(id);
      if (op.from !== undefined) {
        if (onScreen(String(op.from)) && String(op.from) !== id) next.origin[id] = String(op.from);
        else errors.push(`${at}: "from" must be an element on screen that "${id}" grows out of.`);
      }
    } else if (op.op === "remove" || op.op === "move") {
      const found = locate(layout, id);
      if (!found) {
        errors.push(`${at}: "${id}" is not on screen at this step, so it cannot be ${op.op === "remove" ? "removed" : "moved"}.`);
        return;
      }
      const [node] = found.group.children.splice(found.index, 1);
      if (op.op === "remove") {
        record.removed.push(id);
        next.links = next.links.filter(([from, to]) => from !== id && to !== id);
        return;
      }
      const slot = slotFor(layout, op, at, errors);
      if (!slot) {
        found.group.children.splice(found.index, 0, node);
        return;
      }
      slot.group.children.splice(slot.index, 0, node);
    } else if (op.op === "set") {
      if (op.state === undefined && op.value === undefined) errors.push(`${at}: "set" needs a "state" (${STATUSES.join(", ")}) or a "value" from 0 to 1.`);
      if (op.state !== undefined) {
        if (!STATUSES.includes(op.state)) errors.push(`${at}: "state" must be one of ${STATUSES.join(", ")}.`);
        else if (op.state === "idle") delete next.status[id];
        else next.status[id] = op.state;
      }
      if (op.value !== undefined) {
        if (!Number.isFinite(Number(op.value))) errors.push(`${at}: "value" must be a number from 0 to 1.`);
        else next.value[id] = clamp01(op.value);
      }
    } else if (op.op === "link" || op.op === "unlink") {
      const [from, to] = [String(op.from ?? ""), String(op.to ?? "")];
      if (!declared(from) || !declared(to) || from === to) {
        errors.push(`${at}: "${op.op}" needs "from" and "to", two different declared element ids.`);
        return;
      }
      next.links = next.links.filter(([a, b]) => !(a === from && b === to) && !(a === to && b === from));
      if (op.op === "link") next.links.push([from, to]);
    } else if (op.op === "highlight") {
      next.highlight.push(id);
    }
  });
  const shown = new Set(idsIn(layout));
  next.links = next.links.filter(([from, to]) => shown.has(from) && shown.has(to));
  next.highlight = [...new Set(next.highlight)].filter((id) => shown.has(id));
  return { next, record };
}

// Plans that pass every rule can still be the same lazy template; these are
// the patterns that made every product look alike.
function critique(screen, records, elements, states) {
  const errors = [];
  const items = idsIn(screen).filter((id) => elements[id]?.kind !== "panel");
  if (items.length < 4) errors.push(`The screen shows only ${items.length} items. A real product screen is fuller: add the rows, cards, or controls around the action (unlabeled ones are fine).`);
  const ops = new Set(records.flatMap((record) => record.ops));
  if (!["set", "move", "link"].some((op) => ops.has(op))) errors.push("Every step only adds or removes elements. Show the product working on its own objects: change a state (\"set\"), move something (\"move\"), or connect two things (\"link\").");
  records.forEach((record, index) => {
    const swapped = record.removed.filter((id) => ["button", "field"].includes(elements[id]?.kind));
    if (swapped.length && record.inserted.length) {
      errors.push(`steps[${index}] removes "${swapped[0]}" and adds "${record.inserted[0]}" to show a result. Keep "${swapped[0]}" and change it instead, for example {"op": "set", "id": "${swapped[0]}", "state": "done"}.`);
    }
  });
  states.forEach((state, index) => {
    if (state.highlight.length > 2) errors.push(`states[${index}] highlights ${state.highlight.length} elements; highlight at most 2 so one change stays the focus.`);
  });
  return errors;
}

function compileSteps(input, elements, errors) {
  const screen = normalizeNode(input.screen, errors, "screen");
  if (!screen || typeof screen !== "object") {
    errors.push("\"screen\" must be the opening layout: a group such as {\"type\": \"row\", \"children\": [...]}.");
    return { records: [], screen: null, states: [] };
  }
  for (const id of groupIds(screen)) if (Object.hasOwn(elements, id)) errors.push(`Group name "${id}" is also an element id; give the row or column its own name.`);
  // Unnamed rows and columns get internal names that travel through every
  // step, so the engine can find the same group in each state (to fill it).
  let unnamed = 0;
  const name = (node) => {
    if (typeof node === "string" || node.type === "item") return;
    if (node.type !== "panel" && !node.id) node.id = `__g${(unnamed += 1)}`;
    node.children.forEach(name);
  };
  name(screen);
  const status = {};
  const value = {};
  for (const [id, element] of Object.entries(elements)) {
    if (element.state && element.state !== "idle") status[id] = element.state;
    if (element.value !== undefined) value[id] = element.value;
  }
  const states = [{ highlight: [], layout: screen, links: [], origin: {}, status, value }];
  const records = [];
  const steps = Array.isArray(input.steps) ? input.steps : [];
  const [minSteps, maxSteps] = LIMITS.steps;
  if (steps.length < minSteps || steps.length > maxSteps) errors.push(`Use ${minSteps} to ${maxSteps} steps; this plan has ${steps.length}.`);
  steps.slice(0, maxSteps).forEach((step, index) => {
    const where = `steps[${index}]`;
    const trigger = triggerOf(step?.by);
    if (trigger) states[index].pointer = trigger;
    const { next, record } = applyStep(states[index], step, elements, errors, where);
    states.push(next);
    records.push(record);
  });
  return { records, screen, states };
}

function legacyStates(input, elements, errors) {
  const rawStates = Array.isArray(input.states) ? input.states : [];
  const [minStates, maxStates] = LIMITS.states;
  if (rawStates.length < minStates || rawStates.length > maxStates) errors.push(`Use ${minStates} to ${maxStates} states; this plan has ${rawStates.length}.`);
  return rawStates.slice(0, maxStates).map((state, index) => {
    const layout = normalizeNode(state?.layout, errors, `states[${index}].layout`);
    const out = {
      highlight: Array.isArray(state?.highlight) ? state.highlight.map(String).filter((id) => elements[id]) : [],
      layout: layout && typeof layout === "object" ? layout : { children: layout ? [layout] : [], type: "column" },
      links: Array.isArray(state?.links) ? state.links.filter((pair) => Array.isArray(pair) && elements[pair[0]] && elements[pair[1]]).map(([a, b]) => [a, b]) : [],
      origin: Object.fromEntries(Object.entries(state?.origin || {}).filter(([id, from]) => elements[id] && elements[from])),
      status: Object.fromEntries(Object.entries(state?.status || {}).filter(([id, value]) => elements[id] && STATUSES.includes(value) && value !== "idle")),
      value: Object.fromEntries(Object.entries(state?.value || {}).filter(([id, value]) => elements[id] && Number.isFinite(Number(value))).map(([id, value]) => [id, clamp01(value)])),
    };
    if (state?.pointer?.target) out.pointer = { drag: Boolean(state.pointer.drag), hover: Boolean(state.pointer.hover), target: String(state.pointer.target) };
    return out;
  });
}

/**
 * Normalizes and checks a model-authored plan.
 * @param options.driver "user" (default): a pointer acts at least once;
 *   "system": the UI changes on its own, so pointers are dropped.
 * @returns {{ ok: boolean, errors: string[], plan: object | null }}
 *   `errors` are written for the model; `plan` is the cleaned plan when ok.
 */
export function validatePlan(input, { driver = "user" } = {}) {
  const errors = [];
  if (!input || typeof input !== "object") return { errors: ["The plan must be a JSON object."], ok: false, plan: null };

  const elements = {};
  // Elements arrive as an id map or, from schema-constrained output, as a
  // list of {id, kind, ...}.
  const entries = Array.isArray(input.elements)
    ? input.elements.filter((element) => element && typeof element === "object").map(({ id, ...element }) => [String(id ?? ""), element])
    : input.elements && typeof input.elements === "object" ? Object.entries(input.elements) : [];
  if (entries.length === 0) errors.push("Add \"elements\": the list of {id, kind, label?} on screen.");
  if (entries.length > LIMITS.elements) errors.push(`Use at most ${LIMITS.elements} elements; this plan has ${entries.length}. Keep only what the story needs.`);
  for (const [id, element] of entries.slice(0, LIMITS.elements)) {
    if (!ID.test(id)) {
      errors.push(`Element id "${cleanText(id, 40)}" must be lowercase letters, digits, and dashes, starting with a letter.`);
      continue;
    }
    if (Object.hasOwn(elements, id)) {
      errors.push(`Element id "${id}" is declared twice; every element needs its own id.`);
      continue;
    }
    if (!element || !Object.hasOwn(KINDS, element.kind)) {
      errors.push(`Element "${id}" needs a kind from: ${Object.keys(KINDS).join(", ")}.`);
      continue;
    }
    const label = cleanText(element.label, LIMITS.label);
    if (String(element.label ?? "").length > LIMITS.label) errors.push(`Element "${id}" label is too long; keep labels to ${LIMITS.label} characters (a word or two from the product).`);
    elements[id] = {
      kind: element.kind,
      ...(label ? { label } : {}),
      ...(TONES.has(element.tone) ? { tone: element.tone } : {}),
      ...(STATUSES.includes(element.state) && element.state !== "idle" ? { state: element.state } : {}),
      ...(element.value !== undefined && Number.isFinite(Number(element.value)) ? { value: clamp01(element.value) } : {}),
    };
  }

  const stepped = Array.isArray(input.steps) || input.screen !== undefined;
  const compiled = stepped ? compileSteps(input, elements, errors) : null;
  const states = stepped ? compiled.states : legacyStates(input, elements, errors);
  if (driver !== "user") for (const state of states) delete state.pointer;

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
    if (state.pointer && !seen.has(state.pointer.target)) errors.push(`${stepped ? `steps[${index}].by` : `${where}.pointer.target`} "${state.pointer.target}" must be an element on screen when the step starts.`);
  });

  for (let index = 1; index < states.length; index += 1) {
    const [before, after] = [states[index - 1], states[index]];
    const visible = ({ highlight, layout, links, status, value }) => JSON.stringify([layout, highlight, links, status, value]);
    if (visible(before) === visible(after)) {
      errors.push(`${stepped ? `steps[${index - 1}]` : `states[${index}]`} changes nothing visible; each step must change something (an item enters, leaves, moves, changes state, or is highlighted).`);
    }
  }
  if (driver === "user" && !states.slice(0, -1).some((state) => state.pointer)) errors.push(stepped ? "At least one step needs \"by\": {\"click\" | \"drag\" | \"hover\": id}, the action the viewer watches." : "At least one state needs a pointer.target: the action the viewer watches.");
  if (stepped && errors.length === 0) errors.push(...critique(compiled.screen, compiled.records, elements, states));

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
        for (const path of issues) errors.push(`In the ${format.id} frame, ${stepped && index > 0 ? `after steps[${index - 1}]` : stepped ? "the screen" : `states[${index}]`} is too crowded at ${path}: show fewer items there or split them into another group.`);
      });
    }
  }

  return { errors: [...new Set(errors)], ok: errors.length === 0, plan: errors.length === 0 ? plan : null };
}

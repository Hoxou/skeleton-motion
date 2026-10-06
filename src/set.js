const STORY_LIBRARY = {
  dashboard: {
    concept: "dashboard",
    copy: {
      description: "Let one live signal travel through the data while the surrounding metrics stay calm.",
      eyebrow: "Run insight",
      title: "See progress move.",
    },
    id: "progress-signal",
    label: "Progress signal",
  },
  editor: {
    concept: "editor",
    copy: {
      description: "Focus a field, confirm the change, and let the resulting state settle into view.",
      eyebrow: "Focused editing",
      title: "Confirm the change.",
    },
    id: "confirm-edit",
    label: "Confirm edit",
  },
  flow: {
    concept: "flow",
    copy: {
      description: "Open space between two steps and insert the next action exactly where it belongs.",
      eyebrow: "Automation canvas",
      title: "Insert a step in place.",
    },
    id: "insert-step",
    label: "Insert step",
  },
  list: {
    concept: "list",
    copy: {
      description: "Select one item and reveal its useful context without losing the surrounding list.",
      eyebrow: "Test cases",
      title: "Move from list to detail.",
    },
    id: "select-item",
    label: "Select item",
  },
};

const CONCEPT_ORDER = ["flow", "list", "editor", "dashboard"];

export function planAssetSet(analysis, options = {}) {
  const ranked = (analysis.concepts?.ranked || [])
    .filter((item) => item.score > 0 && STORY_LIBRARY[item.kind])
    .map((item) => item.kind);
  const preferred = options.concept && options.concept !== "auto" ? [options.concept] : [];
  const concepts = [...new Set([...preferred, ...ranked, ...CONCEPT_ORDER])].filter((kind) => STORY_LIBRARY[kind]);
  const count = options.set ? Math.min(4, Math.max(2, options.count || 4)) : 1;
  return concepts.slice(0, count).map((concept) => structuredClone(STORY_LIBRARY[concept]));
}

export const __testing = { CONCEPT_ORDER, STORY_LIBRARY };

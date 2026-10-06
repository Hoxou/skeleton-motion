function numericRadius(value) {
  const match = String(value).match(/[\d.]+/);
  if (!match) return 10;
  const number = Number(match[0]);
  if (String(value).includes("rem")) return Math.round(number * 16);
  return Math.min(24, Math.round(number));
}

const MOTION_PROFILES = {
  dashboard: {
    camera: "static",
    emphasis: "path-trace",
    name: "chart-sweep",
    pointer: "none",
  },
  editor: {
    camera: "static",
    emphasis: "confirm-draw",
    name: "focus-and-confirm",
    pointer: "cursor-click",
  },
  flow: {
    camera: "static",
    emphasis: "ghost-insert",
    name: "add-step",
    pointer: "cursor-click",
  },
  list: {
    camera: "static",
    emphasis: "selection-reveal",
    name: "select-and-reveal",
    pointer: "cursor-click",
  },
};

function motionProfile(concept, evidence) {
  const profile = MOTION_PROFILES[concept];

  // A running/status flow reads better as ambient propagation than another
  // cursor demo. Authoring canvases keep the focused add-step choreography.
  const ambientFlow = evidence.length > 0 && evidence.every((item) => /run|status|history/.test(item.file.toLowerCase()));
  if (concept === "flow" && ambientFlow) {
    return {
      camera: "static",
      emphasis: "path-trace",
      name: "route-propagation",
      pointer: "none",
    };
  }

  return { ...profile };
}

export function planScene(analysis, options, theme) {
  const winner = options.concept === "auto" ? analysis.concepts.ranked[0]?.kind || "flow" : options.concept;
  const concept = winner === "list" ? "list" : winner;
  const palette = analysis.palettes[theme];
  const evidence = analysis.concepts.evidence.filter((item) => item.kind === winner).slice(0, 5);
  const profile = motionProfile(concept, evidence);
  return {
    concept,
    containers: concept === "flow" ? 5 : 4,
    duration: options.duration,
    evidence,
    motion: profile.name,
    motionProfile: profile,
    name: options.name || `${analysis.slug}-${concept}`,
    palette: { ...palette, radius: numericRadius(palette.radius) },
    schemaVersion: 1,
    source: analysis.source,
    theme,
    viewport: { height: options.height, width: options.width },
  };
}

export const __testing = { motionProfile };

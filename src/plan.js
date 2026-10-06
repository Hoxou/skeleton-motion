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
    heroMotion: "traveling-marker",
    name: "chart-sweep",
    pointer: "none",
  },
  editor: {
    camera: "static",
    emphasis: "confirm-draw",
    heroMotion: "preview-expand",
    name: "focus-and-confirm",
    pointer: "cursor-click",
  },
  flow: {
    camera: "static",
    emphasis: "layout-insert",
    heroMotion: "layout-open",
    name: "add-step",
    pointer: "cursor-click",
  },
  list: {
    camera: "static",
    emphasis: "selection-reveal",
    heroMotion: "detail-expand",
    name: "select-and-reveal",
    pointer: "cursor-click",
  },
};

function motionProfile(concept, evidence, analysis) {
  const profile = MOTION_PROFILES[concept];

  if (concept === "flow" && analysis.features?.voice) {
    return {
      layers: ["ambient-signal", "task-reorder", "status-confirm"],
      camera: "static",
      emphasis: "speech-transform",
      heroMotion: "task-reorder",
      name: "voice-to-task",
      pointer: "none",
      timing: "overlap",
    };
  }

  // A running/status flow reads better as ambient propagation than another
  // cursor demo. Authoring canvases keep the focused add-step choreography.
  const ambientFlow = evidence.length > 0 && evidence.every((item) => /run|status|history/.test(item.file.toLowerCase()));
  if (concept === "flow" && ambientFlow) {
    return {
      camera: "static",
      emphasis: "path-trace",
      heroMotion: "traveling-signal",
      name: "route-propagation",
      pointer: "none",
    };
  }

  return { ...profile };
}

function motionPhysics(profile) {
  const energyPaths = {
    "add-step": "input-to-layout",
    "chart-sweep": "path-to-marker",
    "focus-and-confirm": "selection-to-preview",
    "route-propagation": "node-to-node",
    "select-and-reveal": "selection-to-detail",
    "voice-to-task": "voice-to-task",
  };
  return {
    anticipation: profile.heroMotion ? "subtle-countermove" : "none",
    continuity: "preserve-identity",
    effects: "no-overshoot",
    energyPath: energyPaths[profile.name] || "source-to-result",
    followThrough: "single-settle",
    spatial: "gentle-overshoot",
  };
}

function colorSemantics(profile, palette) {
  return {
    categories: palette.colorMode === "multicolor" ? "distinct-palette-roles" : "primary-tints",
    confirmation: "primary",
    decorativeCycling: false,
    signal: profile.name === "voice-to-task" ? "primary" : "motion-role",
  };
}

export function planScene(analysis, options, theme) {
  const winner = options.concept === "auto" ? analysis.concepts.ranked[0]?.kind || "flow" : options.concept;
  const concept = winner === "list" ? "list" : winner;
  const palette = analysis.palettesByConcept?.[concept]?.[theme] || analysis.palettes[theme];
  const evidence = analysis.concepts.evidence.filter((item) => item.kind === winner).slice(0, 5);
  const profile = motionProfile(concept, evidence, analysis);
  const backdrop = analysis.visual?.backdrop || "none";
  return {
    backdrop,
    composition: {
      backgroundOwner: "host",
      frame: "none",
      texture: backdrop === "none" ? "none" : "transparent-overlay",
    },
    colorSemantics: colorSemantics(profile, palette),
    concept,
    containers: concept === "flow" ? 5 : 4,
    duration: options.duration,
    evidence,
    motion: profile.name,
    motionPhysics: motionPhysics(profile),
    motionProfile: profile,
    name: options.name || `${analysis.slug}-${concept}`,
    palette: { ...palette, radius: numericRadius(palette.radius) },
    schemaVersion: 1,
    source: analysis.source,
    theme,
    typography: analysis.typography,
    viewport: { height: options.height, width: options.width },
  };
}

export const __testing = { colorSemantics, motionPhysics, motionProfile };

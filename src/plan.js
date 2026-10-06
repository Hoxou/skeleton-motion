import { isComposedMotion } from "./compose/index.js";
import { customFormat, FORMATS, PRIMARY_ASPECT, viewportFor } from "./layout/formats.js";

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
  layout: {
    camera: "static",
    emphasis: "drag-and-snap",
    heroMotion: "position-settle",
    name: "snap-to-grid",
    pointer: "cursor-click",
  },
  palette: {
    camera: "static",
    emphasis: "swatch-recolor",
    heroMotion: "color-crossfade",
    name: "assign-color",
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

// Each motion owns its loop length and beat map so a set never loops in
// lockstep. Beats remap authored keyTimes ([authored, played]): longer travel
// gets more time, quick confirmations stay short, and every reset lands apart.
const MOTION_TIMING = {
  "add-step": { beats: [[0, 0], [0.3, 0.26], [0.62, 0.6], [0.9, 0.87], [1, 1]], duration: 6.2 },
  "assign-color": { beats: [[0, 0], [0.28, 0.24], [0.4, 0.4], [0.9, 0.88], [1, 1]], duration: 4.8 },
  "chart-sweep": { beats: [[0, 0], [0.12, 0.06], [0.72, 0.8], [0.9, 0.95], [1, 1]], duration: 7.4 },
  "focus-and-confirm": { beats: [[0, 0], [0.1, 0.14], [0.45, 0.5], [0.75, 0.8], [0.9, 0.93], [1, 1]], duration: 4.6 },
  "route-propagation": { beats: [[0, 0], [0.5, 0.44], [0.9, 0.82], [1, 1]], duration: 5.8 },
  "select-and-reveal": { beats: [[0, 0], [0.1, 0.06], [0.45, 0.36], [0.74, 0.7], [0.9, 0.84], [1, 1]], duration: 5.4 },
  "snap-to-grid": { beats: [[0, 0], [0.3, 0.26], [0.55, 0.56], [0.9, 0.88], [1, 1]], duration: 5.2 },
  "voice-to-task": { beats: [[0, 0], [0.42, 0.36], [0.62, 0.6], [0.9, 0.9], [1, 1]], duration: 8 },
};

// Taller frames travel farther between the same story beats, so they get a
// little more time; this also keeps the formats of one story out of sync.
const FORMAT_PACE = Object.freeze({ landscape: 1.04, portrait: 1.08, square: 0.96, tall: 1.12, wide: 1 });

function resolveFormat(options) {
  if (options.format) return options.format;
  if (options.width && options.height) return customFormat(options.width, options.height);
  return FORMATS[PRIMARY_ASPECT];
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
  const winner = options.story?.concept || (options.concept === "auto" ? analysis.concepts.ranked[0]?.kind || "flow" : options.concept);
  const concept = winner === "list" ? "list" : winner;
  const palette = options.paletteOverride?.[theme] || analysis.palettesByConcept?.[concept]?.[theme] || analysis.palettes[theme];
  const evidence = options.story?.evidence || analysis.concepts.evidence.filter((item) => item.kind === winner).slice(0, 5);
  const profile = motionProfile(concept, evidence, analysis);
  const backdrop = analysis.visual?.backdrop || "none";
  const timing = MOTION_TIMING[profile.name];
  const format = resolveFormat(options);
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
    composed: isComposedMotion(profile.name),
    duration: options.duration ?? Number((timing.duration * FORMAT_PACE[format.layout]).toFixed(2)),
    evidence,
    format,
    motion: profile.name,
    motionPhysics: motionPhysics(profile),
    motionProfile: profile,
    name: options.name || `${analysis.slug}-${concept}`,
    palette: { ...palette, radius: numericRadius(palette.radius) },
    schemaVersion: 1,
    source: analysis.source,
    story: options.story,
    theme,
    timing: { beats: timing.beats },
    typography: analysis.typography,
    viewport: format.custom ? format.viewport : viewportFor(format),
  };
}

export const __testing = { colorSemantics, MOTION_TIMING, motionPhysics, motionProfile };

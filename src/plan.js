function numericRadius(value) {
  const match = String(value).match(/[\d.]+/);
  if (!match) return 10;
  const number = Number(match[0]);
  if (String(value).includes("rem")) return Math.round(number * 16);
  return Math.min(24, Math.round(number));
}

const MOTIONS = {
  dashboard: "chart-sweep",
  editor: "focus-and-confirm",
  flow: "add-step",
  list: "select-and-reveal",
};

export function planScene(analysis, options, theme) {
  const winner = options.concept === "auto" ? analysis.concepts.ranked[0]?.kind || "flow" : options.concept;
  const concept = winner === "list" ? "list" : winner;
  const palette = analysis.palettes[theme];
  return {
    concept,
    containers: concept === "flow" ? 5 : 4,
    duration: options.duration,
    evidence: analysis.concepts.evidence.filter((item) => item.kind === winner).slice(0, 5),
    motion: MOTIONS[concept],
    name: options.name || `${analysis.slug}-${concept}`,
    palette: { ...palette, radius: numericRadius(palette.radius) },
    schemaVersion: 1,
    source: analysis.source,
    theme,
    viewport: { height: options.height, width: options.width },
  };
}

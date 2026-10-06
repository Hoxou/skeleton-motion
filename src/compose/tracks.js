import { MOTION_EASING } from "../render-svg.js";

export function formatNumber(value, digits = 2) {
  const rounded = Number(value.toFixed(digits));
  return String(Object.is(rounded, -0) ? 0 : rounded).replace(/^(-?)0\./, "$1.");
}

// One timeline per composition: every track shares the same keyTimes and
// keySplines, so any instant is the same weighted blend of two solved
// layouts for every shape. That is what keeps fill and spacing invariants
// true between keyframes, not just on them.
export function createTimeline(keyframes, duration) {
  const keyTimes = keyframes.map(({ at }) => formatNumber(at, 3)).join(";");
  const keySplines = keyframes.slice(1).map(({ ease }) => MOTION_EASING[ease || "gentle"]).join(";");
  const timing = `keyTimes="${keyTimes}" calcMode="spline" keySplines="${keySplines}" dur="${duration}s" repeatCount="indefinite"`;

  function animateText(attribute, text) {
    if (text.every((value) => value === text[0])) return "";
    return `<animate attributeName="${attribute}" values="${text.join(";")}" ${timing} />`;
  }

  // Each numeric track keeps only its own turning points: where it starts,
  // stops, or reverses. Every segment eases out to zero speed, so a keyframe
  // inside a move that keeps its direction (another track's beat, or a
  // two-step authored curve) would stall the move half-way. Tracks driven by
  // the same progress turn at the same beats, so their blends stay identical.
  function animate(attribute, values) {
    const text = values.map((value) => formatNumber(value));
    if (text.every((value) => value === text[0])) return "";
    const times = keyframes.map(({ at }) => at);
    const direction = (from, to) => (Math.abs(to - from) <= 1e-6 * Math.max(1, Math.abs(to)) ? 0 : Math.sign(to - from));
    const kept = [0];
    for (let index = 1; index < values.length - 1; index += 1) {
      if (direction(values[kept.at(-1)], values[index]) !== direction(values[index], values[index + 1])) kept.push(index);
    }
    kept.push(values.length - 1);
    if (kept.length === values.length) return animateText(attribute, text);
    const ownTimes = kept.map((index) => formatNumber(times[index], 3)).join(";");
    const ownSplines = kept.slice(1).map((index) => MOTION_EASING[keyframes[index].ease || "gentle"]).join(";");
    return `<animate attributeName="${attribute}" values="${kept.map((index) => text[index]).join(";")}" keyTimes="${ownTimes}" calcMode="spline" keySplines="${ownSplines}" dur="${duration}s" repeatCount="indefinite" />`;
  }

  // Static attributes take the first keyframe so non-animating renderers show
  // the loop's opening layout.
  function element(tag, tracks, attributes = "", children = "") {
    const initial = Object.entries(tracks).map(([name, values]) => `${name}="${formatNumber(values[0])}"`).join(" ");
    const motion = Object.entries(tracks).map(([name, values]) => animate(name, values)).join("");
    return `<${tag} ${initial}${attributes ? ` ${attributes}` : ""}>${motion}${children}</${tag}>`;
  }

  return { animate, animateText, element, keyTimes: keyframes.map(({ at }) => at) };
}

export function rectTracks(frames) {
  return {
    height: frames.map((rect) => Math.max(0, rect.height)),
    width: frames.map((rect) => Math.max(0, rect.width)),
    x: frames.map((rect) => rect.x),
    y: frames.map((rect) => rect.y),
  };
}

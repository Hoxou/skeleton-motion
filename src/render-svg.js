import { escapeXml } from "./utils.js";

const BASE_WIDTH = 1200;
const BASE_HEIGHT = 675;
const COMPACT_WIDTH = 720;
const COMPACT_HEIGHT = 405;

function clickRipple(duration, at) {
  const start = Math.max(0, at - 0.025);
  const peak = Math.min(1, at + 0.018);
  const end = Math.min(1, at + 0.085);
  return `<circle cx="0" cy="0" r="7" fill="none" stroke="var(--accent)" stroke-width="2" opacity="0">
    <animate attributeName="r" values="7;7;24;29;7" keyTimes="0;${start};${peak};${end};1" dur="${duration}s" repeatCount="indefinite" />
    <animate attributeName="opacity" values="0;0;.62;0;0" keyTimes="0;${start};${peak};${end};1" dur="${duration}s" repeatCount="indefinite" />
  </circle>`;
}

function cursor(duration, frames, clicks = []) {
  const values = frames.map(({ x, y }) => `${x} ${y}`).join(";");
  const keyTimes = frames.map(({ at }) => at).join(";");
  const keySplines = frames.slice(1).map(() => ".22 1 .36 1").join(";");
  return `
    <g id="cursor" opacity="0">
      ${clicks.map((at) => clickRipple(duration, at)).join("")}
      <path d="M2.5 2 V27 L10 19.8 H21.5 Z" fill="var(--accent)" stroke="var(--cursor-outline)" stroke-width="2.2" stroke-linejoin="round" filter="url(#cursor-shadow)" />
      <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.07;.85;.92;1" dur="${duration}s" repeatCount="indefinite" />
      <animateTransform attributeName="transform" type="translate" values="${values}" keyTimes="${keyTimes}" calcMode="spline" keySplines="${keySplines}" dur="${duration}s" repeatCount="indefinite" />
    </g>`;
}

function dots() {
  return `<pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.25" fill="var(--border)" /></pattern>`;
}

function skeletonLines(x, y, widths = [88, 132]) {
  return widths.map((width, index) => `<rect x="${x}" y="${y + index * 14}" width="${width}" height="5" rx="2.5" fill="var(--ink)" opacity="${index === 0 ? 0.2 : 0.1}" />`).join("");
}

function flowScene(scene) {
  const duration = scene.duration;
  const pointer = scene.motionProfile?.pointer !== "none";
  return `
    <rect x="24" y="22" width="672" height="361" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
    <rect x="24" y="22" width="672" height="361" rx="var(--radius)" fill="url(#dots)" opacity=".62" />

    <path d="M197.5 128 V277" stroke="var(--border-strong)" stroke-width="2" />
    <path d="M197.5 128 V277" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="149" stroke-dashoffset="149">
      <animate attributeName="stroke-dashoffset" values="149;149;0;0;149" keyTimes="0;.61;.76;.9;1" dur="${duration}s" repeatCount="indefinite" />
    </path>

    <g>
      <rect x="43" y="48" width="309" height="80" rx="var(--radius)" fill="var(--surface)" stroke="var(--border-strong)" />
      <circle cx="79" cy="88" r="15" fill="var(--muted)" />
      <path d="M72 88h14M79 81v14" stroke="var(--ink)" opacity=".4" stroke-width="2.2" stroke-linecap="round" />
      ${skeletonLines(110, 75, [110, 166])}
    </g>

    <g opacity="0">
      <circle cx="197.5" cy="202.5" r="17" fill="var(--surface)" stroke="var(--accent)" />
      <path d="M190.5 202.5h14M197.5 195.5v14" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" />
      <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;.17;.23;.31;.37;1" dur="${duration}s" repeatCount="indefinite" />
    </g>

    <g id="inserted-card" opacity="${pointer ? "0" : "1"}" transform="translate(197.5 202.5)">
      <g>
        ${pointer ? `<animateTransform attributeName="transform" type="scale" values=".94;.94;1.025;1;1" keyTimes="0;.34;.41;.48;1" calcMode="spline" keySplines=".22 1 .36 1;.22 1 .36 1;.22 1 .36 1;.22 1 .36 1" dur="${duration}s" repeatCount="indefinite" />` : ""}
        <g transform="translate(-197.5 -202.5)">
          <rect x="43" y="162.5" width="309" height="80" rx="var(--radius)" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2" stroke-dasharray="7 6">
            ${pointer ? `<animate attributeName="opacity" values="1;1;0;0;1" keyTimes="0;.6;.68;.9;1" dur="${duration}s" repeatCount="indefinite" />` : ""}
          </rect>
          <rect x="43" y="162.5" width="309" height="80" rx="var(--radius)" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2" opacity="${pointer ? "0" : "1"}">
            ${pointer ? `<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.61;.69;.9;1" dur="${duration}s" repeatCount="indefinite" />` : ""}
          </rect>
          <circle cx="79" cy="202.5" r="15" fill="var(--accent-soft)" stroke="var(--accent)" stroke-opacity=".42" />
          <path d="M72 202.5h14" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" />
          ${skeletonLines(110, 189.5, [134, 86])}
        </g>
      </g>
      ${pointer ? `<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.34;.39;.9;1" dur="${duration}s" repeatCount="indefinite" />` : `<animate attributeName="opacity" values="1;1;.76;1;1" keyTimes="0;.56;.66;.78;1" dur="${duration}s" repeatCount="indefinite" />`}
    </g>

    <g>
      <rect x="43" y="277" width="309" height="80" rx="var(--radius)" fill="var(--surface)" stroke="var(--border-strong)" />
      <circle cx="79" cy="317" r="15" fill="var(--muted)" />
      <path d="M73 311l12 12M85 311l-12 12" stroke="var(--ink)" opacity=".32" stroke-width="2.2" stroke-linecap="round" />
      ${skeletonLines(110, 304, [102, 158])}
    </g>

    <g>
      <rect x="368" y="48" width="309" height="309" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
      <rect x="388" y="68" width="72" height="7" rx="3.5" fill="var(--ink)" opacity=".14" />
      <rect x="468" y="68" width="42" height="7" rx="3.5" fill="var(--ink)" opacity=".07" />
      ${[91, 171, 251].map((y, index) => `<g><rect x="388" y="${y}" width="269" height="70" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)"/><rect x="388" y="${y}" width="269" height="70" rx="var(--radius)" fill="var(--accent-soft)" stroke="var(--accent)" opacity="0">${index === 0 ? `<animate attributeName="opacity" values="0;0;.18;.18;0" keyTimes="0;.45;.52;.64;1" dur="${duration}s" repeatCount="indefinite" />` : ""}</rect><rect x="406" y="${y + 20}" width="30" height="30" rx="var(--radius)" fill="${index === 0 ? "var(--accent-soft)" : "var(--muted)"}"/><rect x="452" y="${y + 27}" width="${index === 0 ? 104 : 82}" height="8" rx="4" fill="var(--ink)" opacity="${index === 0 ? ".2" : ".11"}"/></g>`).join("")}
    </g>
    ${pointer ? cursor(duration, [
      { at: 0, x: 654, y: 350 },
      { at: 0.07, x: 654, y: 350 },
      { at: 0.29, x: 197.5, y: 202.5 },
      { at: 0.38, x: 197.5, y: 202.5 },
      { at: 0.53, x: 506, y: 126 },
      { at: 0.62, x: 506, y: 126 },
      { at: 0.76, x: 270, y: 202.5 },
      { at: 0.87, x: 270, y: 202.5 },
      { at: 1, x: 654, y: 350 },
    ], [0.31, 0.58]) : ""}
  `;
}

function listScene(scene) {
  const duration = scene.duration;
  return `
    <rect x="72" y="86" width="330" height="504" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
    <rect x="98" y="118" width="278" height="34" rx="var(--radius)" fill="var(--muted)" />
    <circle cx="118" cy="135" r="6" fill="var(--ink)" opacity=".15" />
    <rect x="136" y="131" width="88" height="7" rx="3" fill="var(--ink)" opacity=".12" />
    ${[186, 260, 334, 408].map((y, index) => `<g><rect x="98" y="${y}" width="278" height="58" rx="var(--radius)" fill="${index === 1 ? "var(--accent-soft)" : "var(--surface)"}" opacity="${index === 1 ? "0" : "1"}">${index === 1 ? `<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.46;.53;.9;1" dur="${duration}s" repeatCount="indefinite"/>` : ""}</rect><circle cx="120" cy="${y + 29}" r="10" fill="var(--muted)"/>${skeletonLines(144, y + 17, [118, 74])}</g>`).join("")}
    <rect x="454" y="86" width="674" height="504" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
    <rect x="496" y="132" width="150" height="12" rx="6" fill="var(--ink)" opacity=".18" />
    <rect x="496" y="164" width="392" height="7" rx="3.5" fill="var(--ink)" opacity=".08" />
    <rect x="496" y="184" width="302" height="7" rx="3.5" fill="var(--ink)" opacity=".06" />
    <rect x="496" y="240" width="590" height="220" rx="var(--radius)" fill="var(--muted)" opacity=".55" />
    <rect x="524" y="270" width="210" height="9" rx="4.5" fill="var(--ink)" opacity=".12" />
    ${[308, 346, 384, 422].map((y) => `<rect x="524" y="${y}" width="520" height="18" rx="var(--radius)" fill="var(--surface)" opacity=".7"/>`).join("")}
    <rect x="988" y="496" width="98" height="36" rx="var(--radius)" fill="var(--accent)" opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.54;.62;.9;1" dur="${duration}s" repeatCount="indefinite"/></rect>
    ${cursor(duration, [
      { at: 0, x: 760, y: 560 }, { at: .1, x: 760, y: 560 }, { at: .42, x: 242, y: 289 },
      { at: .52, x: 242, y: 289 }, { at: .72, x: 1028, y: 514 }, { at: .86, x: 1028, y: 514 }, { at: 1, x: 760, y: 560 },
    ], [.44, .74])}
  `;
}

function dashboardScene(scene) {
  const duration = scene.duration;
  return `
    ${[72, 386, 700].map((x, index) => `<g><rect x="${x}" y="94" width="278" height="156" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)"/><circle cx="${x + 34}" cy="130" r="10" fill="${index === 1 ? "var(--accent-soft)" : "var(--muted)"}"/><rect x="${x + 58}" y="124" width="82" height="8" rx="4" fill="var(--ink)" opacity=".1"/><rect x="${x + 28}" y="176" width="100" height="22" rx="5" fill="var(--ink)" opacity=".16"/><rect x="${x + 28}" y="214" width="${138 + index * 28}" height="5" rx="2.5" fill="var(--ink)" opacity=".07"/></g>`).join("")}
    <rect x="72" y="292" width="1056" height="292" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
    <path d="M118 512 C210 460 240 486 324 410 C400 342 482 476 566 398 C654 318 730 428 812 350 C884 282 964 376 1082 322" fill="none" stroke="var(--border-strong)" stroke-width="3" />
    <path d="M118 512 C210 460 240 486 324 410 C400 342 482 476 566 398 C654 318 730 428 812 350 C884 282 964 376 1082 322" fill="none" stroke="var(--accent)" stroke-width="3" stroke-dasharray="1160" stroke-dashoffset="1160"><animate attributeName="stroke-dashoffset" values="1160;1160;0;0;1160" keyTimes="0;.12;.72;.9;1" dur="${duration}s" repeatCount="indefinite"/></path>
    <line x1="118" y1="540" x2="1082" y2="540" stroke="var(--border)" />
    <circle r="8" fill="var(--accent)"><animateMotion path="M118 512 C210 460 240 486 324 410 C400 342 482 476 566 398 C654 318 730 428 812 350 C884 282 964 376 1082 322" keyTimes="0;.12;.72;1" keyPoints="0;0;1;1" dur="${duration}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.12;.82;1" dur="${duration}s" repeatCount="indefinite"/></circle>
  `;
}

function editorScene(scene) {
  const duration = scene.duration;
  return `
    <rect x="72" y="76" width="650" height="524" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
    <rect x="762" y="136" width="366" height="404" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
    <rect x="112" y="122" width="224" height="12" rx="6" fill="var(--ink)" opacity=".16" />
    ${[180, 282, 384].map((y, index) => `<g><rect x="112" y="${y}" width="570" height="72" rx="var(--radius)" fill="var(--muted)" opacity=".55"/><rect x="134" y="${y + 20}" width="${132 + index * 30}" height="7" rx="3.5" fill="var(--ink)" opacity=".12"/><rect x="134" y="${y + 39}" width="${240 - index * 24}" height="6" rx="3" fill="var(--ink)" opacity=".07"/>${index === 1 ? `<rect x="112" y="${y}" width="570" height="72" rx="var(--radius)" fill="none" stroke="var(--accent)" stroke-width="2" opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.42;.5;.9;1" dur="${duration}s" repeatCount="indefinite"/></rect>` : ""}</g>`).join("")}
    <rect x="112" y="510" width="116" height="40" rx="var(--radius)" fill="var(--accent)" opacity=".85" />
    <circle cx="945" cy="270" r="64" fill="var(--accent-soft)" />
    <path d="M914 270l20 20 43-46" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="94" stroke-dashoffset="94"><animate attributeName="stroke-dashoffset" values="94;94;0;0;94" keyTimes="0;.58;.7;.9;1" dur="${duration}s" repeatCount="indefinite"/></path>
    ${skeletonLines(858, 374, [174, 128])}
    ${cursor(duration, [
      { at: 0, x: 650, y: 560 }, { at: .1, x: 650, y: 560 }, { at: .43, x: 240, y: 318 },
      { at: .54, x: 240, y: 318 }, { at: .73, x: 170, y: 530 }, { at: .86, x: 170, y: 530 }, { at: 1, x: 650, y: 560 },
    ], [.45, .75])}
  `;
}

export function renderSvg(scene) {
  const { palette, viewport } = scene;
  const viewBox = scene.concept === "flow"
    ? { height: COMPACT_HEIGHT, width: COMPACT_WIDTH }
    : { height: BASE_HEIGHT, width: BASE_WIDTH };
  const content = scene.concept === "flow" ? flowScene(scene)
    : scene.concept === "list" ? listScene(scene)
      : scene.concept === "dashboard" ? dashboardScene(scene)
        : editorScene(scene);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${viewport.width}" height="${viewport.height}" viewBox="0 0 ${viewBox.width} ${viewBox.height}" role="img" aria-labelledby="title description">
  <title id="title">${escapeXml(scene.name)} — ${escapeXml(scene.motion)}</title>
  <desc id="description">Minimal ${escapeXml(scene.concept)} product illustration generated from ${escapeXml(scene.source.input)}.</desc>
  <style>
    :root {
      --accent: ${palette.accent};
      --accent-soft: color-mix(in oklab, ${palette.accent} 12%, ${palette.surface});
      --background: ${palette.background};
      --border: ${palette.border};
      --border-strong: color-mix(in oklab, ${palette.foreground} 18%, ${palette.surface});
      --cursor-outline: ${palette.background};
      --ink: ${palette.foreground};
      --muted: ${palette.muted};
      --radius: ${palette.radius}px;
      --surface: ${palette.surface};
    }
    * { vector-effect: non-scaling-stroke; }
    @media (prefers-reduced-motion: reduce) { svg { visibility: visible; } }
  </style>
  <defs>${dots()}<filter id="cursor-shadow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity=".28" /></filter></defs>
  <rect width="${viewBox.width}" height="${viewBox.height}" fill="var(--background)" />
  ${content}
</svg>`;
}

import { escapeXml } from "./utils.js";

const BASE_WIDTH = 1200;
const BASE_HEIGHT = 675;

function cursor(duration, path, clickAt = 0.46) {
  const clickStart = Math.max(0, clickAt - 0.03);
  const clickPeak = Math.min(1, clickAt + 0.02);
  const clickEnd = Math.min(1, clickAt + 0.08);
  return `
    <g id="cursor" opacity="0">
      <circle cx="0" cy="0" r="22" fill="none" stroke="var(--accent)" stroke-width="2" opacity="0">
        <animate attributeName="r" values="8;8;30;34;8" keyTimes="0;${clickStart};${clickPeak};${clickEnd};1" dur="${duration}s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0;.65;0;0" keyTimes="0;${clickStart};${clickPeak};${clickEnd};1" dur="${duration}s" repeatCount="indefinite" />
      </circle>
      <path d="M0 0 L0 28 L7.5 20 L14 34 L20 31 L13.5 17 L24 16 Z" fill="var(--cursor-fill)" stroke="var(--cursor-stroke)" stroke-width="2" stroke-linejoin="round" />
      <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.08;.84;.94;1" dur="${duration}s" repeatCount="indefinite" />
      <animateMotion path="${path}" keyTimes="0;.12;.42;.58;.78;1" keyPoints="0;.12;.47;.58;.88;1" calcMode="spline" keySplines=".22 1 .36 1;.22 1 .36 1;.22 1 .36 1;.22 1 .36 1;.22 1 .36 1" dur="${duration}s" repeatCount="indefinite" />
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
  return `
    <rect x="64" y="58" width="804" height="558" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
    <rect x="64" y="58" width="804" height="558" rx="var(--radius)" fill="url(#dots)" opacity=".72" />

    <path d="M452 222 V306" stroke="var(--border-strong)" stroke-width="2" />
    <path d="M452 394 V478" stroke="var(--border-strong)" stroke-width="2" />
    <path d="M452 222 V306" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="84" stroke-dashoffset="84">
      <animate attributeName="stroke-dashoffset" values="84;84;0;0;84" keyTimes="0;.52;.68;.86;1" dur="${duration}s" repeatCount="indefinite" />
    </path>
    <path d="M452 394 V478" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="84" stroke-dashoffset="84">
      <animate attributeName="stroke-dashoffset" values="84;84;0;0;84" keyTimes="0;.66;.8;.9;1" dur="${duration}s" repeatCount="indefinite" />
    </path>

    <g>
      <rect x="264" y="132" width="376" height="90" rx="var(--radius)" fill="var(--surface)" stroke="var(--border-strong)" />
      <circle cx="302" cy="177" r="15" fill="var(--muted)" />
      <path d="M296 177h12M302 171v12" stroke="var(--ink)" opacity=".38" stroke-width="2" stroke-linecap="round" />
      ${skeletonLines(332, 164, [104, 154])}
      <circle cx="607" cy="177" r="5" fill="var(--ink)" opacity=".15" />
    </g>

    <g id="middle-card">
      <rect x="264" y="306" width="376" height="88" rx="var(--radius)" fill="var(--surface)" stroke="var(--border-strong)" />
      <rect x="264" y="306" width="376" height="88" rx="var(--radius)" fill="var(--accent-soft)" opacity="0">
        <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.49;.56;.9;1" dur="${duration}s" repeatCount="indefinite" />
      </rect>
      <rect x="264" y="306" width="376" height="88" rx="var(--radius)" fill="none" stroke="var(--accent)" stroke-width="2" opacity="0">
        <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.49;.53;.91;1" dur="${duration}s" repeatCount="indefinite" />
      </rect>
      <circle cx="302" cy="350" r="15" fill="var(--muted)" />
      <path d="M296 350h12" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" />
      ${skeletonLines(332, 337, [126, 82])}
      <rect x="574" y="340" width="34" height="20" rx="10" fill="var(--muted)" />
      <circle cx="584" cy="350" r="6" fill="var(--ink)" opacity=".18">
        <animate attributeName="cx" values="584;584;598;598;584" keyTimes="0;.57;.65;.91;1" dur="${duration}s" repeatCount="indefinite" />
        <animate attributeName="fill" values="var(--ink);var(--ink);var(--accent);var(--accent);var(--ink)" keyTimes="0;.57;.65;.91;1" dur="${duration}s" repeatCount="indefinite" />
      </circle>
    </g>

    <g>
      <rect x="264" y="478" width="376" height="88" rx="var(--radius)" fill="var(--surface)" stroke="var(--border-strong)" />
      <circle cx="302" cy="522" r="15" fill="var(--muted)" />
      <path d="M296 516l12 12M308 516l-12 12" stroke="var(--ink)" opacity=".3" stroke-width="2" stroke-linecap="round" />
      ${skeletonLines(332, 509, [92, 142])}
      <circle cx="607" cy="522" r="5" fill="var(--ink)" opacity=".15" />
    </g>

    <circle cx="452" cy="264" r="15" fill="var(--surface)" stroke="var(--border-strong)" />
    <path d="M446 264h12M452 258v12" stroke="var(--ink)" opacity=".42" stroke-width="2" stroke-linecap="round" />

    <g>
      <rect x="912" y="146" width="224" height="356" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
      <rect x="938" y="174" width="172" height="28" rx="var(--radius)" fill="var(--muted)" />
      <circle cx="958" cy="188" r="6" fill="var(--ink)" opacity=".17" />
      <rect x="974" y="185" width="62" height="6" rx="3" fill="var(--ink)" opacity=".12" />
      ${[230, 294, 358].map((y, index) => `<g><rect x="938" y="${y}" width="172" height="46" rx="var(--radius)" fill="var(--surface)" stroke="${index === 0 ? "var(--accent)" : "var(--border)"}" stroke-opacity="${index === 0 ? ".55" : "1"}"/><rect x="952" y="${y + 12}" width="22" height="22" rx="var(--radius)" fill="${index === 0 ? "var(--accent-soft)" : "var(--muted)"}"/>${skeletonLines(987, y + 12, [74, 48])}</g>`).join("")}
      <rect x="938" y="432" width="104" height="5" rx="2.5" fill="var(--ink)" opacity=".08" />
      <rect x="938" y="446" width="146" height="5" rx="2.5" fill="var(--ink)" opacity=".06" />
    </g>
    ${cursor(duration, "M780 560 C690 520 560 370 452 264 C600 250 805 190 986 252 C880 290 730 340 604 350 C690 420 760 520 780 560", 0.46)}
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
    ${cursor(duration, "M760 560 C580 520 380 360 242 289 C370 260 590 320 820 390 C890 430 940 480 1028 514 C920 540 820 560 760 560", 0.45)}
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
    ${cursor(duration, "M650 560 C580 500 490 400 420 318 C360 300 300 310 240 318 C230 400 210 480 170 530 C350 560 520 570 650 560", 0.45)}
  `;
}

export function renderSvg(scene) {
  const { palette, viewport } = scene;
  const content = scene.concept === "flow" ? flowScene(scene)
    : scene.concept === "list" ? listScene(scene)
      : scene.concept === "dashboard" ? dashboardScene(scene)
        : editorScene(scene);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${viewport.width}" height="${viewport.height}" viewBox="0 0 ${BASE_WIDTH} ${BASE_HEIGHT}" role="img" aria-labelledby="title description">
  <title id="title">${escapeXml(scene.name)} — ${escapeXml(scene.motion)}</title>
  <desc id="description">Minimal ${escapeXml(scene.concept)} product illustration generated from ${escapeXml(scene.source.input)}.</desc>
  <style>
    :root {
      --accent: ${palette.accent};
      --accent-soft: color-mix(in oklab, ${palette.accent} 12%, ${palette.surface});
      --background: ${palette.background};
      --border: ${palette.border};
      --border-strong: color-mix(in oklab, ${palette.foreground} 18%, ${palette.surface});
      --cursor-fill: ${palette.foreground};
      --cursor-stroke: ${palette.background};
      --ink: ${palette.foreground};
      --muted: ${palette.muted};
      --radius: ${palette.radius}px;
      --surface: ${palette.surface};
    }
    * { vector-effect: non-scaling-stroke; }
    @media (prefers-reduced-motion: reduce) { svg { visibility: visible; } }
  </style>
  <defs>${dots()}</defs>
  <rect width="1200" height="675" fill="var(--background)" />
  ${content}
</svg>`;
}

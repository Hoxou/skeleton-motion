import { escapeXml } from "./utils.js";

const BASE_WIDTH = 1200;
const BASE_HEIGHT = 675;
const COMPACT_WIDTH = 720;
const COMPACT_HEIGHT = 405;

// Named motion tokens keep timing consistent without forcing every scene into
// the same choreography. Gentle adds a small authored overshoot via keyframes;
// these curves control how each segment approaches its next keyframe.
const MOTION_EASING = Object.freeze({
  gentle: ".22 .8 .2 1",
  quick: ".16 1 .3 1",
  smoothMove: ".65 0 .35 1",
});

function easingSegments(name, count) {
  return Array.from({ length: count }, () => MOTION_EASING[name]).join(";");
}

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
  const keySplines = easingSegments("smoothMove", frames.length - 1);
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

function sceneBackdrop(scene, opacity = 0.56) {
  if (scene.backdrop === "none") return "";
  const texture = scene.backdrop === "dots" ? `<rect width="720" height="405" fill="url(#dots)" opacity="${opacity}" />` : "";
  return texture;
}

function skeletonLines(x, y, widths = [88, 132]) {
  return widths.map((width, index) => `<rect x="${x}" y="${y + index * 14}" width="${width}" height="5" rx="2.5" fill="var(--ink)" opacity="${index === 0 ? 0.2 : 0.1}" />`).join("");
}

function flowScene(scene) {
  const duration = scene.duration;
  const pointer = scene.motionProfile?.pointer !== "none";
  // Every cursor click below has target-local feedback: the add control opens
  // the layout, the picker row presses/highlights, and the inserted card settles.
  return `
    ${sceneBackdrop(scene, 0.62)}

    <path d="M190 128 V277" stroke="var(--border-strong)" stroke-width="2" />
    <path d="M190 128 V162.5" stroke="var(--accent)" stroke-width="2.5" opacity="0">
      <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.68;.76;.9;1" dur="${duration}s" repeatCount="indefinite" />
    </path>
    <path d="M190 242.5 V277" stroke="var(--accent)" stroke-width="2.5" opacity="0">
      <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.7;.78;.9;1" dur="${duration}s" repeatCount="indefinite" />
    </path>

    <g>
      ${pointer ? `<animateTransform attributeName="transform" type="translate" values="0 56;0 56;0 -2;0 0;0 0;0 56" keyTimes="0;.31;.42;.47;.88;1" calcMode="spline" keySplines="${easingSegments("gentle", 5)}" dur="${duration}s" repeatCount="indefinite" />` : ""}
      <rect x="40" y="48" width="300" height="80" rx="var(--radius)" fill="var(--surface)" stroke="var(--border-strong)" />
      <circle cx="76" cy="88" r="15" fill="var(--tag-1)" />
      <path d="M69 88h14M76 81v14" stroke="var(--accent-2)" opacity=".76" stroke-width="2.2" stroke-linecap="round" />
      ${skeletonLines(107, 75, [110, 158])}
    </g>

    <g opacity="0">
      <circle cx="190" cy="202.5" r="17" fill="var(--surface)" stroke="var(--accent)" />
      <path d="M183 202.5h14M190 195.5v14" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" />
      <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;.17;.23;.31;.37;1" dur="${duration}s" repeatCount="indefinite" />
    </g>

    <g id="inserted-card" opacity="${pointer ? "0" : "1"}" transform="translate(190 202.5)">
      <g>
        ${pointer ? `<animateTransform attributeName="transform" type="scale" values=".94;.94;1.018;1;1" keyTimes="0;.36;.43;.49;1" calcMode="spline" keySplines="${easingSegments("gentle", 4)}" dur="${duration}s" repeatCount="indefinite" />` : ""}
        <g transform="translate(-190 -202.5)">
          <rect x="40" y="162.5" width="300" height="80" rx="var(--radius)" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2" stroke-dasharray="7 6">
            ${pointer ? `<animate attributeName="opacity" values="1;1;0;0;1" keyTimes="0;.6;.68;.9;1" dur="${duration}s" repeatCount="indefinite" />` : ""}
          </rect>
          <rect x="40" y="162.5" width="300" height="80" rx="var(--radius)" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2" opacity="${pointer ? "0" : "1"}">
            ${pointer ? `<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.61;.69;.9;1" dur="${duration}s" repeatCount="indefinite" />` : ""}
          </rect>
          <circle cx="76" cy="202.5" r="15" fill="var(--tag-2)" stroke="var(--accent)" stroke-opacity=".42" />
          <path d="M69 202.5h14" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" />
          ${skeletonLines(107, 189.5, [134, 86])}
        </g>
      </g>
      ${pointer ? `<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.34;.39;.9;1" dur="${duration}s" repeatCount="indefinite" />` : `<animate attributeName="opacity" values="1;1;.76;1;1" keyTimes="0;.56;.66;.78;1" dur="${duration}s" repeatCount="indefinite" />`}
    </g>

    <g>
      ${pointer ? `<animateTransform attributeName="transform" type="translate" values="0 -56;0 -56;0 2;0 0;0 0;0 -56" keyTimes="0;.31;.42;.47;.88;1" calcMode="spline" keySplines="${easingSegments("gentle", 5)}" dur="${duration}s" repeatCount="indefinite" />` : ""}
      <rect x="40" y="277" width="300" height="80" rx="var(--radius)" fill="var(--surface)" stroke="var(--border-strong)" />
      <circle cx="76" cy="317" r="15" fill="var(--tag-3)" />
      <path d="M70 311l12 12M82 311l-12 12" stroke="var(--ink)" opacity=".32" stroke-width="2.2" stroke-linecap="round" />
      ${skeletonLines(107, 304, [102, 150])}
    </g>

    <g id="step-picker">
      <rect x="380" y="48" width="300" height="309" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
      <rect x="400" y="68" width="72" height="7" rx="3.5" fill="var(--ink)" opacity=".14" />
      <rect x="480" y="68" width="42" height="7" rx="3.5" fill="var(--ink)" opacity=".07" />
      ${[91, 171, 251].map((y, index) => `<g${index === 0 ? ` id="clicked-option"` : ""}><rect x="400" y="${y}" width="260" height="70" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)"/><rect x="400" y="${y}" width="260" height="70" rx="var(--radius)" fill="var(--accent-soft)" stroke="var(--accent)" opacity="0">${index === 0 ? `<animate attributeName="opacity" values="0;0;.08;.42;.16;0;0" keyTimes="0;.47;.53;.58;.61;.69;1" calcMode="spline" keySplines="${easingSegments("quick", 6)}" dur="${duration}s" repeatCount="indefinite" /><animate attributeName="stroke-width" values="1;1;1;2.2;1.2;1;1" keyTimes="0;.47;.53;.58;.61;.69;1" dur="${duration}s" repeatCount="indefinite" />` : ""}</rect><rect x="418" y="${y + 20}" width="30" height="30" rx="var(--radius)" fill="var(--tag-${index + 1})"/><rect x="464" y="${y + 27}" width="${index === 0 ? 104 : 82}" height="8" rx="4" fill="var(--ink)" opacity="${index === 0 ? ".2" : ".11"}"/></g>`).join("")}
    </g>
    ${pointer ? cursor(duration, [
      { at: 0, x: 654, y: 350 },
      { at: 0.07, x: 654, y: 350 },
      { at: 0.29, x: 190, y: 202.5 },
      { at: 0.38, x: 190, y: 202.5 },
      { at: 0.53, x: 520, y: 126 },
      { at: 0.62, x: 520, y: 126 },
      { at: 0.76, x: 265, y: 202.5 },
      { at: 0.87, x: 265, y: 202.5 },
      { at: 1, x: 654, y: 350 },
    ], [0.31, 0.58]) : ""}
  `;
}

function voiceFlowScene(scene) {
  const duration = scene.duration;
  const rows = [74, 171, 268];
  const waveformTimes = "0;.125;.25;.375;.5;.625;.75;.875;1";
  const bars = [0, 1, 2, 3, 4].map((index) => {
    const x = 542 + index * 22;
    const heights = Array.from({ length: 8 }, (_, step) => 8 + ((index * 13 + step * 17) % 42));
    heights.push(heights[0]);
    const yValues = heights.map((height) => 206 - height / 2);
    return `<rect x="${x}" y="${yValues[0]}" width="8" height="${heights[0]}" rx="4" fill="var(--accent)" opacity=".82">
      <animate attributeName="y" values="${yValues.join(";")}" keyTimes="${waveformTimes}" dur="${duration}s" repeatCount="indefinite" />
      <animate attributeName="height" values="${heights.join(";")}" keyTimes="${waveformTimes}" dur="${duration}s" repeatCount="indefinite" />
      <animate attributeName="opacity" values=".58;.92;.7;1;.62;.9;.7;.96;.58" keyTimes="${waveformTimes}" dur="${duration}s" repeatCount="indefinite" />
    </rect>`;
  }).join("");

  const rowTransform = (index) => {
    if (index === 0) return `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 -4;0 101;0 97;0 97;0 0" keyTimes="0;.42;.48;.62;.68;.9;1" calcMode="spline" keySplines="${easingSegments("gentle", 6)}" dur="${duration}s" repeatCount="indefinite" />`;
    if (index === 1) return `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 4;0 -101;0 -97;0 -97;0 0" keyTimes="0;.42;.48;.62;.68;.9;1" calcMode="spline" keySplines="${easingSegments("gentle", 6)}" dur="${duration}s" repeatCount="indefinite" />`;
    return "";
  };

  return `
    ${sceneBackdrop(scene, 0.48)}

    ${rows.map((y, index) => `<g${index === 1 ? ` id="voice-updated-task"` : ""}>
      ${rowTransform(index)}
      <rect x="38" y="${y}" width="430" height="64" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
      ${index === 1 ? `<rect x="38" y="${y}" width="430" height="64" rx="var(--radius)" fill="var(--accent-soft)" stroke="var(--accent)" opacity="0">
        <animate attributeName="opacity" values="0;0;.08;.3;.18;.18;0" keyTimes="0;.42;.5;.62;.72;.9;1" dur="${duration}s" repeatCount="indefinite" />
      </rect>` : ""}
      <circle cx="70" cy="${y + 32}" r="12" fill="var(--tag-${index + 1})" />
      <circle cx="70" cy="${y + 32}" r="4" fill="var(--accent-${index + 1})" opacity=".78" />
      <rect x="98" y="${y + 21}" width="${index === 0 ? 142 : index === 1 ? 176 : 118}" height="7" rx="3.5" fill="var(--ink)" opacity=".18" />
      <rect x="98" y="${y + 36}" width="${index === 0 ? 220 : index === 1 ? 196 : 252}" height="5" rx="2.5" fill="var(--ink)" opacity=".08" />
      <rect x="376" y="${y + 19}" width="66" height="26" rx="13" fill="var(--tag-${index + 1})" />
      ${index === 1 ? `<rect x="376" y="${y + 19}" width="66" height="26" rx="13" fill="var(--accent)" opacity="0">
        <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.56;.66;.9;1" dur="${duration}s" repeatCount="indefinite" />
      </rect><path d="M399 ${y + 32}l6 6 12-13" fill="none" stroke="var(--surface)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity="0">
        <animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.62;.68;.9;1" dur="${duration}s" repeatCount="indefinite" />
      </path>` : ""}
    </g>`).join("")}

    <g>
      <animateTransform attributeName="transform" type="translate" values="0 0;0 0;0 4;0 -101;0 -97;0 -97;0 0" keyTimes="0;.42;.48;.62;.68;.9;1" calcMode="spline" keySplines="${easingSegments("gentle", 6)}" dur="${duration}s" repeatCount="indefinite" />
      <path d="M468 203 H504" stroke="var(--accent)" stroke-width="2" opacity="0">
        <animate attributeName="opacity" values="0;.16;.72;.72;.2;0" keyTimes="0;.36;.46;.68;.86;1" dur="${duration}s" repeatCount="indefinite" />
      </path>
    </g>

    <g id="voice-control">
      <rect x="504" y="74" width="178" height="258" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
      <rect x="520" y="90" width="146" height="84" rx="var(--radius)" fill="var(--tag-4)" opacity=".72" />
      <circle cx="593" cy="132" r="25" fill="var(--tag-1)" />
      <path d="M593 117a8 8 0 0 0-8 8v9a8 8 0 0 0 16 0v-9a8 8 0 0 0-8-8Zm-14 16v2a14 14 0 0 0 28 0v-2M593 149v9" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" />
      <circle cx="593" cy="132" r="25" fill="none" stroke="var(--accent)" stroke-width="2" opacity="0">
        <animate attributeName="r" values="25;34;25;38;25;33;25;36;25" keyTimes="${waveformTimes}" dur="${duration}s" repeatCount="indefinite" />
        <animate attributeName="opacity" values=".08;.5;.08;.56;.08;.42;.08;.5;.08" keyTimes="${waveformTimes}" dur="${duration}s" repeatCount="indefinite" />
      </circle>
      <g id="voice-waveform">${bars}</g>
      <rect x="532" y="258" width="122" height="7" rx="3.5" fill="var(--ink)" opacity=".1" />
      <rect x="548" y="277" width="90" height="5" rx="2.5" fill="var(--ink)" opacity=".06" />
    </g>
  `;
}

function listScene(scene) {
  const duration = scene.duration;
  return `
    <rect x="72" y="86" width="330" height="504" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
    <rect x="98" y="118" width="278" height="34" rx="var(--radius)" fill="var(--muted)" />
    <circle cx="118" cy="135" r="6" fill="var(--ink)" opacity=".15" />
    <rect x="136" y="131" width="88" height="7" rx="3" fill="var(--ink)" opacity=".12" />
    ${[186, 260, 334, 408].map((y, index) => `<g><rect x="98" y="${y}" width="278" height="58" rx="var(--radius)" fill="${index === 1 ? "var(--accent-soft)" : "var(--surface)"}" opacity="${index === 1 ? "0" : "1"}">${index === 1 ? `<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.46;.53;.9;1" dur="${duration}s" repeatCount="indefinite"/>` : ""}</rect><circle cx="120" cy="${y + 29}" r="10" fill="var(--tag-${index % 4 + 1})"/>${skeletonLines(144, y + 17, [118, 74])}</g>`).join("")}
    <g transform="translate(791 338)"><g>
      <animateTransform attributeName="transform" type="scale" values=".94;.94;1.012;1;1;.94" keyTimes="0;.42;.54;.61;.9;1" calcMode="spline" keySplines="${easingSegments("gentle", 5)}" dur="${duration}s" repeatCount="indefinite" />
      <g transform="translate(-791 -338)">
        <rect x="454" y="86" width="674" height="504" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
        <rect x="496" y="132" width="150" height="12" rx="6" fill="var(--ink)" opacity=".18" />
        <rect x="496" y="164" width="392" height="7" rx="3.5" fill="var(--ink)" opacity=".08" />
        <rect x="496" y="184" width="302" height="7" rx="3.5" fill="var(--ink)" opacity=".06" />
        <rect x="496" y="240" width="590" height="220" rx="var(--radius)" fill="var(--tag-2)" opacity=".55" />
        <rect x="524" y="270" width="210" height="9" rx="4.5" fill="var(--ink)" opacity=".12" />
        ${[308, 346, 384, 422].map((y) => `<rect x="524" y="${y}" width="520" height="18" rx="var(--radius)" fill="var(--surface)" opacity=".7"/>`).join("")}
        <g transform="translate(1037 514)"><g>
          <animateTransform attributeName="transform" type="scale" values="1;1;.94;1.02;1;1" keyTimes="0;.7;.74;.78;.83;1" calcMode="spline" keySplines="${easingSegments("quick", 5)}" dur="${duration}s" repeatCount="indefinite" />
          <rect x="-49" y="-18" width="98" height="36" rx="var(--radius)" fill="var(--accent)" opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.54;.62;.9;1" dur="${duration}s" repeatCount="indefinite"/></rect>
        </g></g>
      </g>
    </g></g>
    ${cursor(duration, [
      { at: 0, x: 760, y: 560 }, { at: .1, x: 760, y: 560 }, { at: .42, x: 242, y: 289 },
      { at: .52, x: 242, y: 289 }, { at: .72, x: 1028, y: 514 }, { at: .86, x: 1028, y: 514 }, { at: 1, x: 760, y: 560 },
    ], [.44, .74])}
  `;
}

function dashboardScene(scene) {
  const duration = scene.duration;
  return `
    ${[72, 386, 700].map((x, index) => `<g><rect x="${x}" y="94" width="278" height="156" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)"/><circle cx="${x + 34}" cy="130" r="10" fill="var(--tag-${index + 1})"/><rect x="${x + 58}" y="124" width="82" height="8" rx="4" fill="var(--ink)" opacity=".1"/><rect x="${x + 28}" y="176" width="100" height="22" rx="5" fill="var(--ink)" opacity=".16"/><rect x="${x + 28}" y="214" width="${138 + index * 28}" height="5" rx="2.5" fill="var(--ink)" opacity=".07"/></g>`).join("")}
    <rect x="72" y="292" width="1056" height="292" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
    <path d="M118 512 C210 460 240 486 324 410 C400 342 482 476 566 398 C654 318 730 428 812 350 C884 282 964 376 1082 322" fill="none" stroke="var(--border-strong)" stroke-width="3" />
    <path d="M118 512 C210 460 240 486 324 410 C400 342 482 476 566 398 C654 318 730 428 812 350 C884 282 964 376 1082 322" fill="none" stroke="var(--accent)" stroke-width="3" opacity="0"><animate attributeName="opacity" values="0;0;.82;.82;0" keyTimes="0;.12;.22;.9;1" dur="${duration}s" repeatCount="indefinite"/></path>
    <line x1="118" y1="540" x2="1082" y2="540" stroke="var(--border)" />
    <circle r="8" fill="var(--accent)"><animateMotion path="M118 512 C210 460 240 486 324 410 C400 342 482 476 566 398 C654 318 730 428 812 350 C884 282 964 376 1082 322" keyTimes="0;.12;.72;1" keyPoints="0;0;1;1" dur="${duration}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.12;.82;1" dur="${duration}s" repeatCount="indefinite"/></circle>
  `;
}

function editorScene(scene) {
  const duration = scene.duration;
  return `
    <rect x="72" y="76" width="650" height="524" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
    <rect x="112" y="122" width="224" height="12" rx="6" fill="var(--ink)" opacity=".16" />
    ${[180, 282, 384].map((y, index) => `<g><rect x="112" y="${y}" width="570" height="72" rx="var(--radius)" fill="var(--tag-${index + 1})" opacity=".55"/><rect x="134" y="${y + 20}" width="${132 + index * 30}" height="7" rx="3.5" fill="var(--ink)" opacity=".12"/><rect x="134" y="${y + 39}" width="${240 - index * 24}" height="6" rx="3" fill="var(--ink)" opacity=".07"/>${index === 1 ? `<rect x="112" y="${y}" width="570" height="72" rx="var(--radius)" fill="none" stroke="var(--accent)" stroke-width="2" opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.42;.5;.9;1" dur="${duration}s" repeatCount="indefinite"/></rect>` : ""}</g>`).join("")}
    <g transform="translate(170 530)"><g>
      <animateTransform attributeName="transform" type="scale" values="1;1;.94;1.02;1;1" keyTimes="0;.71;.75;.79;.84;1" calcMode="spline" keySplines="${easingSegments("quick", 5)}" dur="${duration}s" repeatCount="indefinite" />
      <rect x="-58" y="-20" width="116" height="40" rx="var(--radius)" fill="var(--accent)" opacity=".85" />
    </g></g>
    <g transform="translate(945 338)"><g>
      <animateTransform attributeName="transform" type="scale" values=".9;.9;.9;1.016;1;1;.9" keyTimes="0;.42;.49;.6;.68;.9;1" calcMode="spline" keySplines="${easingSegments("gentle", 6)}" dur="${duration}s" repeatCount="indefinite" />
      <g transform="translate(-945 -338)">
        <rect x="762" y="136" width="366" height="404" rx="var(--radius)" fill="var(--surface)" stroke="var(--border)" />
        <circle cx="945" cy="270" r="64" fill="var(--tag-2)" />
        <path d="M914 270l20 20 43-46" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.58;.66;.9;1" dur="${duration}s" repeatCount="indefinite"/></path>
        ${skeletonLines(858, 374, [174, 128])}
      </g>
    </g></g>
    ${cursor(duration, [
      { at: 0, x: 650, y: 560 }, { at: .1, x: 650, y: 560 }, { at: .43, x: 240, y: 318 },
      { at: .54, x: 240, y: 318 }, { at: .73, x: 170, y: 530 }, { at: .86, x: 170, y: 530 }, { at: 1, x: 650, y: 560 },
    ], [.45, .75])}
  `;
}

export function renderSvg(scene) {
  const { palette, viewport } = scene;
  const accents = palette.accents?.length ? palette.accents : [palette.accent];
  const pastels = palette.pastels?.length ? palette.pastels : [];
  const accentAt = (index) => accents[index] || accents[index % accents.length] || palette.accent;
  const tagAt = (index) => pastels[index] || `color-mix(in oklab, ${accentAt(index)} 14%, ${palette.surface})`;
  const viewBox = scene.concept === "flow"
    ? { height: COMPACT_HEIGHT, width: COMPACT_WIDTH }
    : { height: BASE_HEIGHT, width: BASE_WIDTH };
  const content = scene.concept === "flow" && scene.motion === "voice-to-task" ? voiceFlowScene(scene)
    : scene.concept === "flow" ? flowScene(scene)
    : scene.concept === "list" ? listScene(scene)
      : scene.concept === "dashboard" ? dashboardScene(scene)
        : editorScene(scene);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${viewport.width}" height="${viewport.height}" viewBox="0 0 ${viewBox.width} ${viewBox.height}" role="img" aria-labelledby="title description">
  <title id="title">${escapeXml(scene.name)} — ${escapeXml(scene.motion)}</title>
  <desc id="description">Minimal ${escapeXml(scene.concept)} product illustration generated from ${escapeXml(scene.source.input)}.</desc>
  <style>
    :root {
      --accent: ${palette.accent};
      --accent-1: ${accentAt(0)};
      --accent-2: ${accentAt(1)};
      --accent-3: ${accentAt(2)};
      --accent-4: ${accentAt(3)};
      --accent-soft: color-mix(in oklab, ${palette.accent} 12%, ${palette.surface});
      --background: ${palette.background};
      --border: ${palette.border};
      --border-strong: color-mix(in oklab, ${palette.foreground} 18%, ${palette.surface});
      --cursor-outline: ${palette.background};
      --ink: ${palette.foreground};
      --muted: ${palette.muted};
      --canvas: ${palette.canvas || palette.background};
      --radius: ${palette.radius}px;
      --surface: ${palette.surface};
      --tag-1: ${tagAt(0)};
      --tag-2: ${tagAt(1)};
      --tag-3: ${tagAt(2)};
      --tag-4: ${tagAt(3)};
    }
    * { vector-effect: non-scaling-stroke; }
    @media (prefers-reduced-motion: reduce) { svg { visibility: visible; } }
  </style>
  <defs>${dots()}<filter id="cursor-shadow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity=".28" /></filter></defs>
  ${content}
</svg>`;
  return svg.replace(/[ \t]+$/gm, "");
}

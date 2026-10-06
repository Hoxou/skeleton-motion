import { escapeXml } from "./utils.js";

export function renderPreview({ name, scenes }) {
  const light = scenes.find((scene) => scene.theme === "light") || scenes[0];
  const dark = scenes.find((scene) => scene.theme === "dark") || scenes[0];
  const hasBoth = light !== dark;
  const asset = (label) => `<div class="asset" aria-label="${escapeXml(name)} animation in ${label}">
    <img class="light" src="./${escapeXml(light.file)}" width="${light.viewport.width}" height="${light.viewport.height}" alt="${escapeXml(name)} product motion, light theme">
    ${hasBoth ? `<img class="dark" src="./${escapeXml(dark.file)}" width="${dark.viewport.width}" height="${dark.viewport.height}" alt="${escapeXml(name)} product motion, dark theme">` : ""}
  </div>`;

  return `<!doctype html>
<html lang="en" data-theme="light" data-scene="display">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>Display — ${escapeXml(name)}</title>
  <style>
    * { box-sizing: border-box; }
    :root {
      color-scheme: light;
      --page: #f1f0ec;
      --page-ink: #18181b;
      --copy: #6b6b70;
      --panel: rgb(255 255 255 / .82);
      --panel-solid: #faf9f6;
      --panel-border: rgb(24 24 27 / .09);
      --panel-shadow: 0 32px 100px rgb(24 24 27 / .12), 0 2px 8px rgb(24 24 27 / .04);
      --page-glow: rgb(24 24 27 / .025);
      --switch: rgb(255 255 255 / .72);
      --switch-hover: rgb(255 255 255 / .96);
    }
    [data-theme="dark"] {
      color-scheme: dark;
      --page: #121214;
      --page-ink: #f4f4f5;
      --copy: #9a9aa0;
      --panel: rgb(29 29 32 / .84);
      --panel-solid: #19191c;
      --panel-border: rgb(255 255 255 / .08);
      --panel-shadow: 0 36px 110px rgb(0 0 0 / .42), 0 2px 10px rgb(0 0 0 / .22);
      --page-glow: rgb(255 255 255 / .025);
      --switch: rgb(38 38 42 / .78);
      --switch-hover: rgb(46 46 51 / .96);
    }
    html, body { min-height: 100%; }
    body {
      margin: 0;
      min-height: 100vh;
      overflow: hidden;
      background: radial-gradient(circle at 47% 48%, var(--page-glow) 0, transparent 46%), var(--page);
      color: var(--page-ink);
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      transition: background-color 320ms ease, color 320ms ease;
    }
    header { position: fixed; z-index: 3; inset: 0 0 auto; padding: 24px 28px; pointer-events: none; }
    .brand { display: flex; align-items: center; gap: 10px; width: max-content; color: inherit; font-size: 11px; font-weight: 650; letter-spacing: .18em; text-transform: uppercase; opacity: .66; }
    .brand::before { content: ""; width: 7px; height: 7px; background: currentColor; box-shadow: 9px 0 0 color-mix(in oklab, currentColor 34%, transparent); }
    .controls { position: fixed; z-index: 4; top: 24px; right: 28px; display: grid; justify-items: end; gap: 10px; }
    button { border: 1px solid var(--panel-border); background: var(--switch); color: inherit; box-shadow: 0 8px 30px rgb(0 0 0 / .07); font: inherit; cursor: pointer; backdrop-filter: blur(18px); transition: background 180ms ease, transform 180ms ease, border-color 180ms ease, opacity 180ms ease; }
    button:hover { background: var(--switch-hover); transform: translateY(-1px); }
    button:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
    .theme-toggle { display: inline-flex; align-items: center; gap: 9px; min-height: 38px; padding: 0 13px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .theme-toggle svg { width: 15px; height: 15px; }
    .moon { display: block; }
    .sun { display: none; }
    [data-theme="dark"] .moon { display: none; }
    [data-theme="dark"] .sun { display: block; }
    .scene-switcher { display: grid; gap: 5px; padding: 5px; border: 1px solid var(--panel-border); border-radius: 14px; background: color-mix(in oklab, var(--page) 72%, transparent); box-shadow: 0 16px 44px rgb(0 0 0 / .08); backdrop-filter: blur(18px); }
    .scene-button { min-width: 88px; padding: 8px 10px; border-color: transparent; border-radius: 9px; background: transparent; box-shadow: none; color: var(--copy); font-size: 11px; font-weight: 620; text-align: left; }
    .scene-button[aria-pressed="true"] { border-color: var(--panel-border); background: var(--switch-hover); color: var(--page-ink); box-shadow: 0 4px 14px rgb(0 0 0 / .06); }
    main { min-height: 100vh; padding: 92px 150px 56px 5vw; }
    .scene { display: none; min-height: calc(100vh - 148px); place-items: center; animation: scene-in 360ms cubic-bezier(.22, 1, .36, 1) both; }
    .scene.is-active { display: grid; }
    @keyframes scene-in { from { opacity: 0; transform: translateY(8px) scale(.992); } to { opacity: 1; transform: none; } }
    .asset { position: relative; overflow: hidden; border: 1px solid var(--panel-border); border-radius: 18px; box-shadow: var(--panel-shadow); transform: translateZ(0); }
    .asset::after { content: ""; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 1px 0 rgb(255 255 255 / .12); pointer-events: none; }
    img { display: block; width: 100%; height: auto; }
    .dark { display: none; }
    [data-theme="dark"] .light { display: none; }
    [data-theme="dark"] .dark { display: block; }
    .display-scene .asset { width: min(82vw, 760px); }
    .feature-card { width: min(82vw, 900px); display: grid; grid-template-columns: .72fr 1.28fr; align-items: center; gap: 36px; padding: 34px; border: 1px solid var(--panel-border); border-radius: 24px; background: var(--panel); box-shadow: 0 24px 80px rgb(0 0 0 / .08); }
    .feature-card .asset { border-radius: 14px; }
    .eyebrow { margin: 0 0 14px; color: var(--copy); font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
    h1, h2, p { margin-top: 0; }
    h1, h2 { margin-bottom: 14px; max-width: 12ch; font-size: clamp(28px, 3.4vw, 50px); line-height: .98; letter-spacing: -.045em; }
    p { max-width: 38ch; margin-bottom: 0; color: var(--copy); font-size: 14px; line-height: 1.55; }
    .split-layout { width: min(88vw, 1020px); display: grid; grid-template-columns: .8fr 1.2fr; align-items: center; gap: clamp(42px, 7vw, 94px); }
    .split-layout .asset { border-radius: 16px; }
    .bento-layout { width: min(86vw, 960px); display: grid; grid-template-columns: 1.42fr .58fr; grid-template-rows: 1fr 1fr; gap: 14px; }
    .bento-cell { min-height: 180px; overflow: hidden; border: 1px solid var(--panel-border); border-radius: 22px; background: var(--panel); }
    .bento-asset { grid-row: 1 / 3; display: grid; align-items: center; padding: 22px; }
    .bento-asset .asset { border-radius: 13px; box-shadow: 0 20px 58px rgb(0 0 0 / .1); }
    .bento-copy { padding: 26px; display: flex; flex-direction: column; justify-content: end; }
    .bento-copy h2 { max-width: 8ch; margin: 0; font-size: 30px; }
    .bento-detail { position: relative; padding: 26px; }
    .bento-detail::before { content: ""; position: absolute; width: 54px; height: 54px; border: 1px solid var(--panel-border); background: var(--panel-solid); }
    .bento-detail::after { content: ""; position: absolute; left: 42px; bottom: 32px; width: 52%; height: 8px; border-radius: 8px; background: var(--page-ink); opacity: .1; box-shadow: 0 18px 0 color-mix(in oklab, var(--page-ink) 55%, transparent); }
    @media (max-width: 900px) {
      main { padding: 100px 120px 36px 24px; }
      .feature-card, .split-layout { grid-template-columns: 1fr; gap: 26px; }
      .feature-card, .split-layout { width: min(72vw, 640px); }
      .bento-layout { width: min(72vw, 640px); grid-template-columns: 1fr; grid-template-rows: auto; }
      .bento-asset { grid-row: auto; }
      .bento-copy, .bento-detail { display: none; }
    }
    @media (max-width: 640px) {
      header { padding: 18px; }
      .brand span { display: none; }
      .controls { top: 18px; right: 18px; }
      .scene-switcher { display: none; }
      main { padding: 88px 18px 30px; }
      .display-scene .asset, .feature-card, .split-layout, .bento-layout { width: 100%; }
      .feature-card { padding: 18px; border-radius: 16px; }
    }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
  </style>
</head>
<body>
  <header><div class="brand"><span>Display</span></div></header>
  <aside class="controls" aria-label="Display controls">
    ${hasBoth ? `<button class="theme-toggle" id="theme-toggle" type="button" aria-label="Switch to dark mode" aria-pressed="false">
      <svg class="moon" aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <svg class="sun" aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3.5" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      <span id="theme-label">Dark</span>
    </button>` : ""}
    <nav class="scene-switcher" aria-label="Preview scene">
      ${[["display", "Display"], ["card", "Card"], ["split", "Split"], ["bento", "Bento"]].map(([id, label], index) => `<button class="scene-button" type="button" data-scene-button="${id}" aria-pressed="${index === 0}">${label}</button>`).join("")}
    </nav>
  </aside>
  <main>
    <section class="scene display-scene is-active" data-scene-panel="display">${asset("display view")}</section>
    <section class="scene" data-scene-panel="card"><article class="feature-card"><div><p class="eyebrow">Automation</p><h2>Build flows in place.</h2><p>Add an action exactly where it belongs, without breaking the sequence.</p></div>${asset("feature card")}</article></section>
    <section class="scene" data-scene-panel="split"><div class="split-layout"><div><p class="eyebrow">Visual workflows</p><h1>Every step stays clear.</h1><p>Compose, inspect, and refine browser scenarios from one focused canvas.</p></div>${asset("split feature")}</div></section>
    <section class="scene" data-scene-panel="bento"><div class="bento-layout"><div class="bento-cell bento-asset">${asset("bento feature")}</div><div class="bento-cell bento-copy"><p class="eyebrow">Flows</p><h2>Insert anywhere.</h2></div><div class="bento-cell bento-detail" aria-hidden="true"></div></div></section>
  </main>
  <script>
    const root = document.documentElement;
    const toggle = document.querySelector("#theme-toggle");
    const label = document.querySelector("#theme-label");
    const sceneButtons = [...document.querySelectorAll("[data-scene-button]")];
    const scenePanels = [...document.querySelectorAll("[data-scene-panel]")];
    const stored = localStorage.getItem("display-theme");
    const preferred = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    function setTheme(theme) {
      const dark = theme === "dark";
      root.dataset.theme = theme;
      if (!toggle) return;
      toggle.setAttribute("aria-pressed", String(dark));
      toggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      label.textContent = dark ? "Light" : "Dark";
      localStorage.setItem("display-theme", theme);
    }
    function setScene(scene) {
      root.dataset.scene = scene;
      for (const button of sceneButtons) button.setAttribute("aria-pressed", String(button.dataset.sceneButton === scene));
      for (const panel of scenePanels) panel.classList.toggle("is-active", panel.dataset.scenePanel === scene);
    }
    setTheme(stored || preferred);
    setScene("display");
    toggle?.addEventListener("click", () => setTheme(root.dataset.theme === "dark" ? "light" : "dark"));
    for (const button of sceneButtons) button.addEventListener("click", () => setScene(button.dataset.sceneButton));
  </script>
</body>
</html>`;
}

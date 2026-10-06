import { escapeXml } from "./utils.js";

function safeCss(value, fallback) {
  const text = String(value || "").trim();
  return text && !/[;{}<>]/.test(text) ? text : fallback;
}

function labelFromId(value) {
  return String(value).replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function renderPreview({ assets, fontFile, name, scenes, zipFile }) {
  const groups = assets?.length ? assets : [{ id: name, label: labelFromId(name), scenes }];
  const primary = groups[0];
  const light = primary.scenes.find((scene) => scene.theme === "light") || primary.scenes[0];
  const dark = primary.scenes.find((scene) => scene.theme === "dark") || primary.scenes[0];
  const hasBoth = light !== dark;
  const lightPalette = light.palette || {};
  const darkPalette = dark.palette || lightPalette;
  const typography = light.typography || {};
  const fontStack = safeCss(typography.stack, "ui-sans-serif, system-ui, sans-serif");
  const sceneRadius = Math.max(0, Math.min(32, Number.parseFloat(lightPalette.radius) || 0));
  const archive = zipFile || `${name}.assets.zip`;
  const lightAccents = lightPalette.accents || [lightPalette.accent];
  const darkAccents = darkPalette.accents || [darkPalette.accent];

  function picture(group, label, active = false, switchable = true) {
    const groupLight = group.scenes.find((scene) => scene.theme === "light") || group.scenes[0];
    const groupDark = group.scenes.find((scene) => scene.theme === "dark") || group.scenes[0];
    const groupHasBoth = groupLight !== groupDark;
    const switchAttributes = switchable ? ` data-asset-view="${escapeXml(group.id)}"` : "";
    return `<div class="asset-view${active ? " is-active" : ""}"${switchAttributes} aria-label="${escapeXml(group.label)} animation in ${label}">
      <img class="light" src="./${escapeXml(groupLight.file)}" width="${groupLight.viewport.width}" height="${groupLight.viewport.height}" alt="${escapeXml(group.label)} product motion, light theme">
      ${groupHasBoth ? `<img class="dark" src="./${escapeXml(groupDark.file)}" width="${groupDark.viewport.width}" height="${groupDark.viewport.height}" alt="${escapeXml(group.label)} product motion, dark theme">` : ""}
    </div>`;
  }

  const assetSlot = (label) => `<div class="asset-slot">${groups.map((group, index) => picture(group, label, index === 0)).join("")}</div>`;
  const hasStory = groups.length > 1;
  const sceneOptions = [["display", "Display"], ["card", "Card"], ["split", "Split"], ["bento", "Bento"], ...(hasStory ? [["story", "Story"], ["overview", "Set"]] : [])];
  const fallbackCopy = { description: "A focused product motion composed for a landing-page feature.", eyebrow: "Product motion", title: "Show the useful moment." };
  const copyFor = (group) => ({ ...fallbackCopy, ...(group.copy || {}) });
  const staticCopy = (group, heading = "h2") => {
    const copy = copyFor(group);
    return `<div><p class="eyebrow">${escapeXml(copy.eyebrow)}</p><${heading}>${escapeXml(copy.title)}</${heading}><p>${escapeXml(copy.description)}</p></div>`;
  };
  const switchableCopy = (heading = "h2") => `<div class="copy-stack">${groups.map((group, index) => `<div class="copy-view${index === 0 ? " is-active" : ""}" data-asset-copy="${escapeXml(group.id)}">${staticCopy(group, heading)}</div>`).join("")}</div>`;
  const storyScene = hasStory ? `<section class="scene" data-scene-panel="story"><div class="story-layout">${groups.map((group, index) => `<article class="story-row${index % 2 ? " reverse" : ""}">${index % 2 ? `${picture(group, `story row ${index + 1}`, true, false)}${staticCopy(group)}` : `${staticCopy(group)}${picture(group, `story row ${index + 1}`, true, false)}`}</article>`).join("")}</div></section>` : "";
  const overviewScene = hasStory ? `<section class="scene" data-scene-panel="overview"><div class="set-grid">${groups.map((group) => `<article class="set-card"><div class="set-card-label">${escapeXml(group.label)}</div>${picture(group, "set overview", true, false)}</article>`).join("")}</div></section>` : "";

  return `<!doctype html>
<html lang="en" data-theme="light" data-scene="display" data-asset="${escapeXml(primary.id)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>Display — ${escapeXml(name)}</title>
  <style>
    ${fontFile ? `@font-face { font-family: "Source Preview"; src: url("./${escapeXml(fontFile)}"); font-display: swap; }` : ""}
    * { box-sizing: border-box; }
    :root {
      color-scheme: light;
      --accent: ${safeCss(lightPalette.accent, "#4f46e5")};
      --accent-2: ${safeCss(lightAccents[1], lightPalette.accent || "#4f46e5")};
      --accent-3: ${safeCss(lightAccents[2], lightAccents[1] || lightPalette.accent || "#4f46e5")};
      --page: ${safeCss(lightPalette.background, "#fff")};
      --page-ink: ${safeCss(lightPalette.foreground, "#171717")};
      --copy: ${safeCss(lightPalette.mutedForeground, "#71717a")};
      --panel: ${safeCss(lightPalette.surface, "#fff")};
      --panel-solid: ${safeCss(lightPalette.muted, "#f4f4f5")};
      --panel-border: ${safeCss(lightPalette.border, "#e5e7eb")};
      --control-radius: ${sceneRadius}px;
      --scene-radius: ${sceneRadius}px;
      --switch: var(--panel);
      --switch-hover: var(--panel-solid);
    }
    [data-theme="dark"] {
      color-scheme: dark;
      --accent: ${safeCss(darkPalette.accent, "#818cf8")};
      --accent-2: ${safeCss(darkAccents[1], darkPalette.accent || "#818cf8")};
      --accent-3: ${safeCss(darkAccents[2], darkAccents[1] || darkPalette.accent || "#818cf8")};
      --page: ${safeCss(darkPalette.background, "#111113")};
      --page-ink: ${safeCss(darkPalette.foreground, "#fafafa")};
      --copy: ${safeCss(darkPalette.mutedForeground, "#a1a1aa")};
      --panel: ${safeCss(darkPalette.surface, "#202024")};
      --panel-solid: ${safeCss(darkPalette.muted, "#27272a")};
      --panel-border: ${safeCss(darkPalette.border, "rgb(255 255 255 / 10%)")};
      --switch: var(--panel);
      --switch-hover: var(--panel-solid);
    }
    html, body { min-height: 100%; }
    body { margin: 0; min-height: 100vh; overflow-x: hidden; background: var(--page); color: var(--page-ink); font-family: ${fontFile ? `"Source Preview", ` : ""}${fontStack}; transition: background-color 320ms ease, color 320ms ease; }
    header { position: fixed; z-index: 3; inset: 0 0 auto; padding: 24px 28px; pointer-events: none; }
    .brand { display: flex; align-items: center; gap: 10px; width: max-content; font-size: 11px; font-weight: 650; letter-spacing: .18em; text-transform: uppercase; opacity: .66; }
    .brand::before { content: ""; width: 7px; height: 7px; background: currentColor; box-shadow: 9px 0 0 color-mix(in oklab, currentColor 34%, transparent); }
    .controls { position: fixed; z-index: 4; top: 24px; right: 28px; display: grid; width: 116px; justify-items: stretch; gap: 8px; }
    button, .download { border: 1px solid var(--panel-border); background: var(--switch); color: inherit; font: inherit; cursor: pointer; backdrop-filter: blur(18px); transition: background 180ms ease, transform 180ms ease, border-color 180ms ease; }
    button:hover, .download:hover { background: var(--switch-hover); transform: translateY(-1px); }
    button:focus-visible, .download:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    .theme-toggle { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 38px; padding: 0 12px; border-radius: var(--control-radius); font-size: 12px; font-weight: 600; }
    .theme-toggle svg { width: 15px; height: 15px; }
    .moon { display: block; } .sun { display: none; }
    [data-theme="dark"] .moon { display: none; } [data-theme="dark"] .sun { display: block; }
    .option-group { display: grid; gap: 4px; padding: 5px; border: 1px solid var(--panel-border); border-radius: var(--control-radius); background: var(--switch); backdrop-filter: blur(18px); }
    .group-label { padding: 4px 7px 2px; color: var(--copy); font-size: 9px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    .option-button { min-width: 0; padding: 7px 9px; border-color: color-mix(in oklab, var(--panel-border) 72%, transparent); border-radius: var(--control-radius); background: var(--panel); box-shadow: none; color: var(--copy); font-size: 11px; font-weight: 620; text-align: left; }
    .option-button[aria-pressed="true"] { border-color: color-mix(in oklab, var(--accent) 24%, var(--panel-border)); background: color-mix(in oklab, var(--accent) 8%, var(--switch-hover)); color: var(--page-ink); }
    [data-scene="story"] [aria-label="Animation"], [data-scene="overview"] [aria-label="Animation"] { opacity: .42; pointer-events: none; }
    .download { display: flex; align-items: center; justify-content: center; min-height: 38px; padding: 0 10px; border-radius: var(--control-radius); font-size: 11px; font-weight: 650; text-decoration: none; }
    main { min-height: 100vh; padding: 92px 166px 56px 5vw; }
    .scene { display: none; min-height: calc(100vh - 148px); place-items: center; animation: scene-in 360ms cubic-bezier(.22, 1, .36, 1) both; }
    .scene.is-active { display: grid; }
    @keyframes scene-in { from { opacity: 0; transform: translateY(8px) scale(.992); } to { opacity: 1; transform: none; } }
    .asset-slot, .asset-view { width: 100%; }
    .asset-view { display: none; }
    .asset-view.is-active, .asset-view:not([data-asset-view]) { display: block; }
    .copy-view { display: none; }
    .copy-view.is-active { display: block; }
    img { display: block; width: 100%; height: auto; }
    .dark { display: none; }
    [data-theme="dark"] .light { display: none; }
    [data-theme="dark"] .dark { display: block; }
    .display-scene .asset-slot { width: min(82vw, 760px); }
    .feature-card { width: min(82vw, 900px); display: grid; grid-template-columns: .72fr 1.28fr; align-items: center; gap: 36px; padding: 34px; border: 1px solid var(--panel-border); border-radius: var(--scene-radius); background: var(--panel); }
    .eyebrow { margin: 0 0 14px; color: var(--copy); font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
    h1, h2, p { margin-top: 0; }
    h1, h2 { margin-bottom: 14px; max-width: 12ch; font-size: clamp(28px, 3.4vw, 50px); line-height: .98; letter-spacing: -.045em; }
    p { max-width: 38ch; margin-bottom: 0; color: var(--copy); font-size: 14px; line-height: 1.55; }
    .split-layout { width: min(88vw, 1020px); display: grid; grid-template-columns: .8fr 1.2fr; align-items: center; gap: clamp(42px, 7vw, 94px); }
    .bento-layout { width: min(86vw, 960px); display: grid; grid-template-columns: 1.42fr .58fr; grid-template-rows: 1fr 1fr; gap: 14px; }
    .bento-cell { min-height: 180px; overflow: hidden; border: 1px solid var(--panel-border); border-radius: var(--scene-radius); background: var(--panel); }
    .bento-asset { grid-row: 1 / 3; display: grid; align-items: center; padding: 22px; }
    .bento-copy { padding: 26px; display: flex; flex-direction: column; justify-content: end; }
    .bento-copy h2 { max-width: 8ch; margin: 0; font-size: 30px; }
    .bento-detail { position: relative; padding: 26px; }
    .bento-detail::before { content: ""; position: absolute; width: 54px; height: 54px; border: 1px solid var(--panel-border); border-radius: var(--scene-radius); background: var(--panel-solid); }
    .bento-detail::after { content: ""; position: absolute; left: 42px; bottom: 32px; width: 52%; height: 8px; background: var(--page-ink); opacity: .1; box-shadow: 0 18px 0 color-mix(in oklab, var(--page-ink) 55%, transparent); }
    .story-layout { width: min(86vw, 980px); display: grid; gap: clamp(54px, 8vh, 88px); }
    .story-row { display: grid; grid-template-columns: .78fr 1.22fr; align-items: center; gap: clamp(38px, 7vw, 88px); }
    .story-row.reverse { grid-template-columns: 1.22fr .78fr; }
    .story-row h2 { font-size: clamp(28px, 3vw, 44px); }
    .set-grid { width: min(80vw, 1000px); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .set-card { position: relative; min-height: 280px; display: grid; align-items: center; padding: 22px; overflow: hidden; border: 1px solid var(--panel-border); border-radius: var(--scene-radius); background: var(--panel); }
    .set-card-label { position: absolute; top: 18px; left: 20px; z-index: 1; color: var(--copy); font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
    @media (max-width: 900px) {
      main { padding: 100px 138px 36px 24px; }
      .feature-card, .split-layout, .story-row, .story-row.reverse { grid-template-columns: 1fr; gap: 26px; }
      .feature-card, .split-layout, .story-layout { width: min(70vw, 640px); }
      .bento-layout { width: min(70vw, 640px); grid-template-columns: 1fr; grid-template-rows: auto; }
      .set-grid { width: min(74vw, 720px); grid-template-columns: 1fr; }
      .bento-asset { grid-row: auto; } .bento-copy, .bento-detail { display: none; }
    }
    @media (max-width: 640px) {
      header { padding: 18px; } .brand span { display: none; }
      .controls { top: 18px; right: 18px; width: 104px; }
      .option-group { display: none; }
      main { padding: 88px 18px 30px; }
      .display-scene .asset-slot, .feature-card, .split-layout, .bento-layout, .story-layout, .set-grid { width: 100%; }
      .feature-card { padding: 18px; }
    }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
  </style>
</head>
<body>
  <header><div class="brand"><span>Display</span></div></header>
  <aside class="controls" aria-label="Display controls">
    ${hasBoth ? `<button class="theme-toggle" id="theme-toggle" type="button" aria-label="Switch to dark mode" aria-pressed="false"><svg class="moon" aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z" stroke="currentColor" stroke-width="1.8"/></svg><svg class="sun" aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3.5" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2" stroke="currentColor" stroke-width="1.8"/></svg><span id="theme-label">Dark</span></button>` : ""}
    <nav class="option-group" aria-label="Animation"><span class="group-label">Animation</span>${groups.map((group, index) => `<button class="option-button" type="button" data-asset-button="${escapeXml(group.id)}" aria-pressed="${index === 0}">${escapeXml(group.label)}</button>`).join("")}</nav>
    <nav class="option-group" aria-label="Preview scene"><span class="group-label">Scene</span>${sceneOptions.map(([id, label], index) => `<button class="option-button" type="button" data-scene-button="${id}" aria-pressed="${index === 0}">${label}</button>`).join("")}</nav>
    <a class="download" href="./${escapeXml(archive)}" download>Download ZIP</a>
  </aside>
  <main>
    <section class="scene display-scene is-active" data-scene-panel="display">${assetSlot("display view")}</section>
    <section class="scene" data-scene-panel="card"><article class="feature-card">${switchableCopy("h2")}${assetSlot("feature card")}</article></section>
    <section class="scene" data-scene-panel="split"><div class="split-layout">${switchableCopy("h1")}${assetSlot("split feature")}</div></section>
    <section class="scene" data-scene-panel="bento"><div class="bento-layout"><div class="bento-cell bento-asset">${assetSlot("bento feature")}</div><div class="bento-cell bento-copy">${switchableCopy("h2")}</div><div class="bento-cell bento-detail" aria-hidden="true"></div></div></section>${storyScene}${overviewScene}
  </main>
  <script>
    const root = document.documentElement;
    const toggle = document.querySelector("#theme-toggle");
    const themeLabel = document.querySelector("#theme-label");
    const assetButtons = [...document.querySelectorAll("[data-asset-button]")];
    const assetViews = [...document.querySelectorAll("[data-asset-view]")];
    const assetCopies = [...document.querySelectorAll("[data-asset-copy]")];
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
      themeLabel.textContent = dark ? "Light" : "Dark";
      localStorage.setItem("display-theme", theme);
    }
    function setAsset(asset) {
      root.dataset.asset = asset;
      for (const button of assetButtons) button.setAttribute("aria-pressed", String(button.dataset.assetButton === asset));
      for (const view of assetViews) view.classList.toggle("is-active", view.dataset.assetView === asset);
      for (const copy of assetCopies) copy.classList.toggle("is-active", copy.dataset.assetCopy === asset);
    }
    function setScene(scene) {
      root.dataset.scene = scene;
      for (const button of sceneButtons) button.setAttribute("aria-pressed", String(button.dataset.sceneButton === scene));
      for (const panel of scenePanels) panel.classList.toggle("is-active", panel.dataset.scenePanel === scene);
    }
    setTheme(stored || preferred); setAsset(${JSON.stringify(primary.id)}); setScene("display");
    toggle?.addEventListener("click", () => setTheme(root.dataset.theme === "dark" ? "light" : "dark"));
    for (const button of assetButtons) button.addEventListener("click", () => setAsset(button.dataset.assetButton));
    for (const button of sceneButtons) button.addEventListener("click", () => setScene(button.dataset.sceneButton));
  </script>
</body>
</html>`;
}

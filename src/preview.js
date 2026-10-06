import { escapeXml } from "./utils.js";

export function renderPreview({ name, scenes }) {
  const light = scenes.find((scene) => scene.theme === "light") || scenes[0];
  const dark = scenes.find((scene) => scene.theme === "dark") || scenes[0];
  const hasBoth = light !== dark;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeXml(name)} preview</title>
  <style>
    * { box-sizing: border-box; }
    html { color-scheme: light dark; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #ececf0; font-family: ui-sans-serif, system-ui, sans-serif; }
    main { width: min(94vw, 1200px); }
    img { display: block; width: 100%; height: auto; box-shadow: 0 24px 80px rgb(0 0 0 / .12); }
    .dark { display: none; }
    @media (prefers-color-scheme: dark) {
      body { background: #0b0b0d; }
      ${hasBoth ? ".light { display: none; } .dark { display: block; }" : ""}
    }
  </style>
</head>
<body>
  <main>
    <img class="light" src="./${escapeXml(light.file)}" width="${light.viewport.width}" height="${light.viewport.height}" alt="${escapeXml(name)} product motion, light theme">
    ${hasBoth ? `<img class="dark" src="./${escapeXml(dark.file)}" width="${dark.viewport.width}" height="${dark.viewport.height}" alt="${escapeXml(name)} product motion, dark theme">` : ""}
  </main>
</body>
</html>`;
}

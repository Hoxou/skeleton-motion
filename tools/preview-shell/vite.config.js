import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(REPO, "package.json"));
// Latin subset only (~30 KB): the room is one file opened from disk, so the
// chrome font is inlined rather than linked. Other scripts use the fallback.
const CHROME_FONT = path.join(path.dirname(require.resolve("@fontsource-variable/instrument-sans")), "files/instrument-sans-latin-wght-normal.woff2");

export default defineConfig({
  base: "./",
  plugins: [react()],
  // Dev server only: serves the example set that src/devData.js describes.
  publicDir: path.join(REPO, "examples/qa-segnatura-set"),
  resolve: {
    alias: { "chrome-font.woff2": CHROME_FONT },
    // SiteHeaderView is imported from website/; both sides must share one React.
    dedupe: ["react", "react-dom"],
  },
  server: { fs: { allow: [REPO] } },
  build: {
    // Everything (font included) must end up inside the single HTML file;
    // scripts/sync-preview-shell.mjs inlines the one JS and one CSS output.
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    copyPublicDir: false,
    cssCodeSplit: false,
    modulePreload: false,
  },
});

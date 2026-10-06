import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { roomData } from "./room-data.js";
import { escapeXml } from "./utils.js";

// The Display Room is a React app in tools/preview-shell/, prebuilt into
// this single self-contained file by `npm run build:preview-shell`. Never
// hand-edit it. A run only injects its data; the app renders everything.
const SHELL_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "preview-shell.html");
const DATA_MARKER = /<!--ROOM_DATA-->[\s\S]*?<!--\/ROOM_DATA-->/;

export function renderPreview(options) {
  const data = roomData(options);
  // Escaping "<" keeps any label from closing the <script> element early.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const shell = readFileSync(SHELL_PATH, "utf8");
  if (!DATA_MARKER.test(shell)) throw new Error('ROOM_DATA marker not found in preview-shell.html - run "npm run build:preview-shell".');
  return shell
    .replace(/<title>[^<]*<\/title>/, () => `<title>Display Room - ${escapeXml(data.name)}</title>`)
    .replace(DATA_MARKER, () => `<script type="application/json" id="room-data">${json}</script>`);
}

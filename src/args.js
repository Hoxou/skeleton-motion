import path from "node:path";
import { parseAspect } from "./layout/formats.js";

const HELP = `
skeleton-motion — minimal product-motion assets from a repository or URL

Usage:
  skeleton-motion <repo-path-or-url> [options]

Options:
  --out <dir>          Output directory (default: ./skeleton-motion-output)
  --name <slug>        Asset name (default: inferred from source)
  --set                Generate a coordinated multi-asset set
  --count <number>     Assets in a set, from 2 to 4 (default: 4)
  --theme <value>      light, dark, or auto (default: auto)
  --aspects <values>   Frame shapes, comma-separated (default: 16:9,4:3,1:1,4:5,9:16)
  --width <pixels>     Exact width; with --height, renders one custom rectangle
  --height <pixels>    Exact height; with --width, renders one custom rectangle
  --duration <seconds> Loop duration (default: per motion)
  --concept <value>    auto, flow, list, dashboard, or editor (default: auto)
  --format <values>    svg,html,gif,webm,mp4 or comma-separated (default: svg,html)
  --help               Show help

Examples:
  skeleton-motion ../qa-segnatura --theme dark --format svg,html
  skeleton-motion ../qa-segnatura --set --out ./motion-set
  skeleton-motion https://example.com --width 1600 --height 900
  skeleton-motion ../qa-segnatura --set --aspects 16:9,1:1
`;

function readValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function positiveNumber(value, flag) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${flag} must be a positive number`);
  }
  return number;
}

export function parseArgs(argv, cwd = process.cwd()) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };

  let source;
  const options = {
    concept: "auto",
    count: 4,
    formats: ["svg", "html"],
    out: path.resolve(cwd, "skeleton-motion-output"),
    theme: "auto",
    set: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      if (source) throw new Error(`unexpected argument: ${arg}`);
      source = arg;
      continue;
    }

    if (arg === "--set") {
      options.set = true;
      continue;
    }

    const value = readValue(argv, index, arg);
    index += 1;
    if (arg === "--out") options.out = path.resolve(cwd, value);
    else if (arg === "--name") options.name = value;
    else if (arg === "--count") options.count = positiveNumber(value, arg);
    else if (arg === "--theme") options.theme = value;
    else if (arg === "--width") options.width = positiveNumber(value, arg);
    else if (arg === "--height") options.height = positiveNumber(value, arg);
    else if (arg === "--duration") options.duration = positiveNumber(value, arg);
    else if (arg === "--concept") options.concept = value;
    else if (arg === "--aspects") {
      options.aspects = [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))].map(parseAspect);
    }
    else if (arg === "--format") {
      options.formats = [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
    } else throw new Error(`unknown option: ${arg}`);
  }

  if (!source) throw new Error("source repository path or URL is required\n\nRun with --help for usage.");
  if (!["light", "dark", "auto"].includes(options.theme)) {
    throw new Error("--theme must be light, dark, or auto");
  }
  if (!["auto", "flow", "list", "dashboard", "editor"].includes(options.concept)) {
    throw new Error("--concept must be auto, flow, list, dashboard, or editor");
  }
  if (!Number.isInteger(options.count) || options.count < 2 || options.count > 4) {
    throw new Error("--count must be an integer from 2 to 4");
  }
  const allowedFormats = new Set(["svg", "html", "gif", "webm", "mp4"]);
  const invalid = options.formats.find((format) => !allowedFormats.has(format));
  if (invalid) throw new Error(`unsupported format: ${invalid}`);

  return { ...options, source };
}

export { HELP };

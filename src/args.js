import path from "node:path";

const HELP = `
skeleton-motion — one minimal product-motion asset per run

Usage:
  skeleton-motion <repo-path-or-url> [options]

Options:
  --out <dir>          Output directory (default: ./skeleton-motion-output)
  --name <slug>        Asset name (default: inferred from source)
  --theme <value>      light, dark, or auto (default: auto)
  --width <pixels>     Width (default: 720)
  --height <pixels>    Height (default: 405)
  --duration <seconds> Loop duration (default: 5)
  --concept <value>    auto, flow, list, dashboard, or editor (default: auto)
  --format <values>    svg,html,gif,webm,mp4 or comma-separated (default: svg,html)
  --help               Show help

Examples:
  skeleton-motion ../qa-segnatura --theme dark --format svg,html
  skeleton-motion https://example.com --width 1600 --height 900
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
    duration: 5,
    formats: ["svg", "html"],
    height: 405,
    out: path.resolve(cwd, "skeleton-motion-output"),
    theme: "auto",
    width: 720,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      if (source) throw new Error(`unexpected argument: ${arg}`);
      source = arg;
      continue;
    }

    const value = readValue(argv, index, arg);
    index += 1;
    if (arg === "--out") options.out = path.resolve(cwd, value);
    else if (arg === "--name") options.name = value;
    else if (arg === "--theme") options.theme = value;
    else if (arg === "--width") options.width = positiveNumber(value, arg);
    else if (arg === "--height") options.height = positiveNumber(value, arg);
    else if (arg === "--duration") options.duration = positiveNumber(value, arg);
    else if (arg === "--concept") options.concept = value;
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
  const allowedFormats = new Set(["svg", "html", "gif", "webm", "mp4"]);
  const invalid = options.formats.find((format) => !allowedFormats.has(format));
  if (invalid) throw new Error(`unsupported format: ${invalid}`);

  return { ...options, source };
}

export { HELP };

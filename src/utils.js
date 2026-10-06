import fs from "node:fs/promises";
import path from "node:path";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "vendor",
]);

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".htm",
  ".json",
  ".js",
  ".jsx",
  ".md",
  ".mdx",
  ".scss",
  ".sass",
  ".svelte",
  ".ts",
  ".tsx",
  ".vue",
]);

export async function collectTextFiles(root, limit = 2_500) {
  const files = [];
  const queue = [root];
  while (queue.length > 0 && files.length < limit) {
    const directory = queue.shift();
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".storybook") continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) queue.push(absolute);
      } else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(absolute);
        if (files.length >= limit) break;
      }
    }
  }
  return files;
}

export async function readText(file, maxBytes = 400_000) {
  const handle = await fs.open(file, "r");
  try {
    const stat = await handle.stat();
    const size = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(size);
    await handle.read(buffer, 0, size, 0);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

export function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "product-motion";
}

export function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function isUrl(value) {
  return /^https?:\/\//i.test(value);
}

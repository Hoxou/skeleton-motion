#!/usr/bin/env node
// Re-renders a hosted job's SVGs with the current engine from the plans and
// palette stored in its manifest, then uploads them over the old files in
// R2. No model call: the stories stay the same, only how they are drawn
// changes. Rooms are rendered live from the manifest, so they need nothing.
//
//   node scripts/rerender-job.mjs <job-id> [more ids...] [--dry-run]
//
// Needs wrangler logged in to the account that owns the R2 bucket.

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parseArgs } from "../src/args.js";
import { generateCollection } from "../src/generate.js";

const run = promisify(execFile);
const SITE = "https://skeleton-motion.qa-segnatura.workers.dev";
const BUCKET = "skeleton-motion-store";
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const ids = args.filter((arg) => !arg.startsWith("--"));
if (ids.length === 0) {
  console.error("usage: rerender-job.mjs <job-id> [more ids...] [--dry-run]");
  process.exit(1);
}

const DATABASE = "skeleton-motion-jobs";
const JOB_ID = /^[A-Za-z0-9_-]{16}$/;

async function manifestOf(id) {
  if (!JOB_ID.test(id)) throw new Error(`Not a job id: ${id}`);
  const { stdout } = await run("npx", ["wrangler", "d1", "execute", DATABASE, "--remote", "--json", "--command", `SELECT collection FROM jobs WHERE id = '${id}'`]);
  const collection = JSON.parse(stdout)[0]?.results?.[0]?.collection;
  if (!collection) throw new Error(`No job ${id}`);
  const response = await fetch(`${SITE}/jobs/${id}/${collection}.manifest.json`);
  if (!response.ok) throw new Error(`No manifest for job ${id} (${response.status})`);
  return { collection, manifest: await response.json() };
}

for (const id of ids) {
  const { collection, manifest } = await manifestOf(id);
  const stories = manifest.set.assets.filter((asset) => asset.plan).map((asset) => ({ copy: asset.copy, id: asset.id.split(".").pop(), label: asset.label, plan: asset.plan }));
  const analysis = { ...manifest.analysis, slug: collection };
  const options = parseArgs([analysis.source.input, "--set", "--name", collection], "/");
  const files = generateCollection(analysis, options, { stories }).files.filter((file) => file.name.endsWith(".svg"));
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `rerender-${id}-`));
  for (const file of files) await fs.writeFile(path.join(dir, file.name), file.data);
  console.log(`${id}: ${files.length} SVGs rendered${dryRun ? ` in ${dir}` : ""}`);
  if (dryRun) continue;
  for (const file of files) {
    await run("npx", ["wrangler", "r2", "object", "put", `${BUCKET}/jobs/${id}/${file.name}`, "--file", path.join(dir, file.name), "--content-type", "image/svg+xml", "--remote"]);
  }
  console.log(`${id}: uploaded`);
}

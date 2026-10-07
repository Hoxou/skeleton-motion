#!/usr/bin/env node
// Engine releases: every production deploy is the next vN. The number lives
// in two places, both written by .github/workflows/deploy-worker.yml: the git
// tag engine-vN on the deployed commit, and the Cloudflare Worker version tag.
//
//   node scripts/engine-version.mjs next          print the next release number
//   node scripts/engine-version.mjs list          releases known to git
//   node scripts/engine-version.mjs rollback v7   point production back at v7
//
// Rollback is instant when Cloudflare still lists the version (its 10 most
// recent); otherwise it exits 3 and the caller rebuilds from the git tag.
// The pre-versioning engine counts as v1, so the first versioned deploy is v2.

import { execFileSync } from "node:child_process";

const BASELINE = 1;
const TAG = /^engine-v(\d+)$/;
const NOT_ON_CLOUDFLARE = 3;

const run = (command, args) => execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

export function releaseNumbers(tags) {
  return tags.map((tag) => TAG.exec(tag.trim())?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
}

export function nextRelease(tags) {
  return Math.max(BASELINE, ...releaseNumbers(tags)) + 1;
}

/** The Cloudflare version id deployed as `release`, or null when it has aged out of the list. */
export function versionIdFor(versions, release) {
  const matches = versions.filter((version) => version.annotations?.["workers/tag"] === release);
  return matches.sort((a, b) => b.metadata.created_on.localeCompare(a.metadata.created_on))[0]?.id ?? null;
}

const gitTags = () => run("git", ["tag", "--list", "engine-v*"]).split("\n").filter(Boolean);

function rollback(release) {
  if (!/^v\d+$/.test(release || "")) throw new Error(`Name a release like v7, not "${release}".`);
  const versions = JSON.parse(run("npx", ["wrangler", "versions", "list", "--json"]));
  const id = versionIdFor(versions, release);
  if (!id) {
    console.error(`${release} is no longer among Cloudflare's recent versions; rebuild it from tag engine-${release}.`);
    process.exit(NOT_ON_CLOUDFLARE);
  }
  run("npx", ["wrangler", "rollback", id, "--message", `rollback to ${release}`, "--yes"]);
  console.log(`Production now serves ${release} (${id}).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, release] = process.argv.slice(2);
  if (command === "next") console.log(nextRelease(gitTags()));
  else if (command === "list") console.log(releaseNumbers(gitTags()).map((number) => `v${number}`).join("\n") || `v${BASELINE} (untagged)`);
  else if (command === "rollback") rollback(release);
  else {
    console.error("usage: engine-version.mjs next | list | rollback vN");
    process.exit(1);
  }
}

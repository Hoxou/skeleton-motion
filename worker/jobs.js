import { analyzeSource } from "../src/analyze.js";
import { parseArgs } from "../src/args.js";
import { generateCollection } from "../src/generate.js";
import { renderPreview } from "../src/preview.js";
import { previewInputFromManifest } from "../src/room-data.js";
import { createZip } from "../src/zip.js";
import previewShell from "../src/preview-shell.html";
import { recordHostedUse, resolveProvider } from "./ai/access.js";
import { githubRepo, isThin, pageDigest, pageSummary, productLinks, repoContext } from "./ai/context.js";
import { designStories } from "./ai/design.js";
import { ProviderError } from "./ai/providers.js";
import { measureBrand } from "./brand.js";
import { probeToCss } from "./brand-probe.js";
import { newToken } from "./owner.js";
import { assertPublicUrl, createSafeFetch } from "./safe-fetch.js";
import { logError, logWarning } from "./log.js";

const JOB_ID = /^[A-Za-z0-9_-]{16}$/;
// Set by the deploy workflow (`--var ENGINE_VERSION:vN`); local runs are "dev".
export const engineVersion = (env) => env.ENGINE_VERSION || "dev";
const VISIBILITIES = new Set(["private", "public"]);
const PAGE_SIZE = 24;
const CURSOR = /^(\d{4}-\d\d-\d\dT[\d:.]+Z)\|([A-Za-z0-9_-]{16})$/;
const FILE_NAME = /^[A-Za-z0-9._-]{1,180}$/;
const CONTENT_TYPES = {
  html: "text/html; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  zip: "application/zip",
};

export class UserError extends Error {
  constructor(message, code = "user-error") {
    super(message);
    this.code = code;
  }
}

function providerMessage(error, hosted) {
  if (error.kind === "rate-limited") return hosted ? "The free AI is busy right now. Try again in a minute, or add your own key." : "Your AI provider is rate limiting this key. Try again in a minute.";
  if (error.kind === "auth") return hosted ? "The free AI is unavailable right now. Add your own key to keep going." : "Your AI provider rejected the key. Check it in AI settings.";
  if (error.kind === "unavailable") return "The AI provider did not answer. Try again.";
  return "The AI could not design animations for this product. Try again, or try another page of the product.";
}

export function isJobId(value) {
  return JOB_ID.test(value);
}

function normalizeSource(raw) {
  const value = String(raw || "").trim();
  if (!value) throw new UserError("Enter a URL to generate from");
  if (value.length > 2_000) throw new UserError("That URL is too long");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  let url;
  try {
    url = assertPublicUrl(withScheme);
  } catch (error) {
    throw new UserError(error.message);
  }
  // Generations can be listed publicly; query strings and fragments often
  // carry tokens and never change a page's brand, so they are dropped.
  url.search = "";
  url.hash = "";
  return url;
}

function contentType(file) {
  return CONTENT_TYPES[file.split(".").pop()] || "application/octet-stream";
}

const PAGE_TIMEOUT_MS = 5_000;

async function readProductPages(fetchOnce, html, base) {
  const read = async (href) => {
    const response = await Promise.race([
      fetchOnce(href, { headers: { "accept-language": "en-US,en;q=0.8" } }),
      new Promise((resolve) => { setTimeout(() => resolve(null), PAGE_TIMEOUT_MS); }),
    ]).catch(() => null);
    return response?.ok ? pageSummary(await response.text(), response.url || href) : null;
  };
  const pages = await Promise.all(productLinks(html, base).map(read));
  return pages.filter((page) => page && (page.title || page.headings.length));
}

/**
 * Analyzes a public URL, renders the full set, and stores it under
 * `jobs/<id>/` in R2 with one D1 row for the owner's gallery.
 */
export async function createJob(env, ownerHash, body) {
  const url = normalizeSource(body?.source);
  const visibility = VISIBILITIES.has(body?.visibility) ? body.visibility : "public";
  const startedAt = Date.now();
  // Checked before any fetching: a visitor with no AI left gets the wall at once.
  const access = await resolveProvider(env, ownerHash);

  const safeFetch = createSafeFetch();
  const responses = new Map();
  // Later passes (brand re-analysis, page digest) reuse earlier downloads.
  const fetchOnce = (input, init) => {
    const key = String(input);
    if (!responses.has(key)) responses.set(key, safeFetch(input, init));
    return responses.get(key);
  };
  const github = { accept: "application/vnd.github+json", "user-agent": "skeleton-motion" };
  const fetchJson = async (target) => {
    const response = await fetchOnce(target, { headers: github }).catch(() => null);
    return response?.ok ? JSON.parse(await response.text()) : null;
  };
  const fetchText = async (target) => {
    const response = await fetchOnce(target, { headers: github }).catch(() => null);
    return response?.ok ? response.text() : null;
  };

  const repo = githubRepo(url);
  const repoInfo = repo ? await repoContext(repo, { fetchJson, fetchText }).catch(() => null) : null;
  // A repository is styled by its product's homepage when it names one.
  const pageUrl = repoInfo?.homepage ? (() => { try { return normalizeSource(repoInfo.homepage); } catch { return url; } })() : url;
  const host = (repo ? `${repo.owner}-${repo.repo}` : pageUrl.hostname.replace(/^www\./, "")).toLowerCase();

  let analysis;
  try {
    analysis = await analyzeSource(pageUrl.href, { fetch: fetchOnce });
  } catch (error) {
    throw new UserError(`Could not read ${pageUrl.hostname}: ${error.message}`);
  }
  const homeHtml = await (await fetchOnce(pageUrl.href)).text();
  const digest = pageDigest(homeHtml);
  // A few public product pages (features, solutions, docs) name the
  // product's other areas, so the three stories can come from different ones.
  const pagesPromise = repo ? Promise.resolve([]) : readProductPages(fetchOnce, homeHtml, pageUrl.href);
  // A brand token is certain; a color read from stylesheets is a guess that
  // the rendered page (coverage, call-to-action color) can correct.
  const needsBrand = analysis.palettes.light.accentSource !== "token";
  const needsText = isThin(digest);
  // Raw HTML rarely carries the brand or the copy of JS-rendered apps; only
  // then is the (budgeted) browser worth asking.
  let brandSource = "static";
  let rendered = null;
  if (needsBrand || needsText) {
    const brand = await measureBrand(env, new URL(analysis.source.input), { needsContent: needsText });
    brandSource = brand.source;
    rendered = brand.probe;
    if (needsBrand && (rendered?.accent || rendered?.fontBody)) {
      analysis = await analyzeSource(pageUrl.href, { fetch: fetchOnce, measuredCss: probeToCss(rendered) });
    }
  }
  const content = needsText && rendered?.content ? rendered.content : digest;
  const pages = await pagesPromise;

  let design;
  try {
    design = await designStories(access.provider, { ...content, colors: analysis.palettes.light.shares || analysis.palettes.light.accents?.length || 1, pages, repo: repoInfo, url: url.href });
  } catch (error) {
    if (error instanceof ProviderError) {
      // The reason is the provider's short status text; keys never appear in it.
      // A visitor's own key: keep only the failure kind, never provider text.
      logError({ hosted: access.hosted, kind: error.kind, message: "ai design failed", provider: access.provider.label, ...(access.hosted ? { reason: error.message } : { status: error.status }) });
      throw new UserError(providerMessage(error, access.hosted), `ai-${error.kind}`);
    }
    throw error;
  }
  if (design.rejected) logWarning({ message: "ai stories rejected", provider: access.provider.label, rejections: design.rejections });
  if (access.hosted) await recordHostedUse(env, ownerHash);

  const options = parseArgs([pageUrl.href, "--set", "--name", host], "/");
  const result = generateCollection(analysis, options, { engineVersion: engineVersion(env), preview: { shell: previewShell }, stories: design.stories });

  const id = newToken(12);
  const files = [...result.files, result.manifest];
  await Promise.all(files.map((file) => env.STORE.put(`jobs/${id}/${file.name}`, file.data, {
    httpMetadata: { contentType: contentType(file.name) },
  })));

  const hero = result.assets[0].scenes;
  const heroes = {};
  for (const scene of hero) heroes[scene.format.id] = { ...heroes[scene.format.id], [scene.theme]: scene.file };
  const job = {
    assetCount: result.assets.length,
    collection: result.collectionName,
    createdAt: new Date().toISOString(),
    engineVersion: engineVersion(env),
    fileCount: files.length,
    heroDark: hero.find((scene) => scene.theme === "dark")?.file || null,
    heroes,
    heroLight: hero.find((scene) => scene.theme === "light")?.file || hero[0].file,
    id,
    name: String(analysis.name || host).slice(0, 160),
    source: url.href,
    visibility,
  };
  await env.DB.prepare(
    "INSERT INTO jobs (id, owner_hash, source, name, collection, hero_light, hero_dark, heroes, asset_count, file_count, created_at, visibility, engine_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(job.id, ownerHash, job.source, job.name, job.collection, job.heroLight, job.heroDark, JSON.stringify(heroes), job.assetCount, job.fileCount, job.createdAt, job.visibility, job.engineVersion).run();

  return { ...job, ai: { calls: design.calls, hosted: access.hosted, provider: access.provider.label, rejected: design.rejected, rejections: design.rejections, timings: design.timings }, brandSource, durationMs: Date.now() - startedAt, url: `/jobs/${id}/` };
}

function heroesOf(row) {
  try {
    const parsed = row.heroes ? JSON.parse(row.heroes) : null;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // Fall through to the 16:9 pair every job has.
  }
  return { "16:9": { dark: row.hero_dark, light: row.hero_light } };
}

function toJob(row) {
  return {
    assetCount: row.asset_count,
    collection: row.collection,
    createdAt: row.created_at,
    engineVersion: row.engine_version ?? null,
    heroDark: row.hero_dark,
    heroLight: row.hero_light,
    heroes: heroesOf(row),
    id: row.id,
    name: row.name,
    source: row.source,
    url: `/jobs/${row.id}/`,
    visibility: row.visibility,
  };
}

export async function listJobs(env, ownerHash) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM jobs WHERE owner_hash = ? ORDER BY created_at DESC LIMIT 200",
  ).bind(ownerHash).all();
  return results.map(toJob);
}

/**
 * One page of the shared gallery, newest first. `before` is the opaque
 * cursor from the previous page; owner identity is never included.
 */
export async function listPublicJobs(env, before) {
  const cursor = typeof before === "string" ? before.match(CURSOR) : null;
  const statement = cursor
    ? env.DB.prepare("SELECT * FROM jobs WHERE visibility = 'public' AND (created_at, id) < (?, ?) ORDER BY created_at DESC, id DESC LIMIT ?").bind(cursor[1], cursor[2], PAGE_SIZE + 1)
    : env.DB.prepare("SELECT * FROM jobs WHERE visibility = 'public' ORDER BY created_at DESC, id DESC LIMIT ?").bind(PAGE_SIZE + 1);
  const { results } = await statement.all();
  const page = results.slice(0, PAGE_SIZE).map(toJob);
  const last = page.at(-1);
  return { jobs: page, next: results.length > PAGE_SIZE && last ? `${last.createdAt}|${last.id}` : null };
}

/** Changes listing visibility; returns false unless the caller owns the job. */
export async function setVisibility(env, ownerHash, id, visibility) {
  if (!isJobId(id) || !VISIBILITIES.has(visibility)) return false;
  const { meta } = await env.DB.prepare("UPDATE jobs SET visibility = ? WHERE id = ? AND owner_hash = ?").bind(visibility, id, ownerHash).run();
  return meta.changes === 1;
}

export async function findJob(env, id) {
  const row = await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first();
  return row ? toJob(row) : null;
}

async function buildZip(env, id) {
  const listed = await env.STORE.list({ prefix: `jobs/${id}/` });
  const entries = await Promise.all(listed.objects.map(async (object) => ({
    data: new Uint8Array(await (await env.STORE.get(object.key)).arrayBuffer()),
    name: object.key.slice(`jobs/${id}/`.length),
  })));
  return createZip(entries);
}

/**
 * Serves a stored job file. `/jobs/<id>/` resolves to the Display Room and
 * the archive is assembled on download instead of being stored.
 */
// Rooms render from the stored manifest with the current shell, so every
// generation, old or new, gets room improvements such as Copy code.
async function renderRoom(env, id, collection) {
  const manifestFile = `${collection}.manifest.json`;
  const object = await env.STORE.get(`jobs/${id}/${manifestFile}`);
  if (!object) return null;
  const input = previewInputFromManifest(await object.json(), manifestFile);
  return new Response(renderPreview(input, previewShell), {
    headers: { "cache-control": "public, max-age=300", "content-type": CONTENT_TYPES.html },
  });
}

export async function serveJobFile(env, id, file) {
  const job = await findJob(env, id);
  if (!job) return null;
  const name = file || `${job.collection}.preview.html`;
  if (!FILE_NAME.test(name)) return null;
  if (name === `${job.collection}.assets.zip`) {
    return new Response(await buildZip(env, id), {
      headers: { "content-disposition": `attachment; filename="${name}"`, "content-type": CONTENT_TYPES.zip },
    });
  }
  if (name === `${job.collection}.preview.html`) return renderRoom(env, id, job.collection);
  const object = await env.STORE.get(`jobs/${id}/${name}`);
  if (!object) return null;
  return new Response(object.body, {
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": object.httpMetadata?.contentType || contentType(name),
    },
  });
}

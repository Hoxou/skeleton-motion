import { AccessError, deleteOwnKey, hostedUsage, saveOwnKey } from "./ai/access.js";
import { browserUsage } from "./brand.js";
import { createJob, engineVersion, isJobId, listJobs, listPublicJobs, serveJobFile, setVisibility, UserError } from "./jobs.js";
import { hashToken, isOwnerToken, ownerCookie, readOwnerToken, resolveOwner } from "./owner.js";
import { logError } from "./log.js";

const DAILY_JOBS_PER_OWNER = 60;
const JOB_PATH = /^\/jobs\/([^/]+)(?:\/([^/]*))?$/;
const VISIBILITY_PATH = /^\/api\/jobs\/([^/]+)\/visibility$/;

const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:";
const ROOM_CSP = "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'";

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", ...headers },
    status,
  });
}

// Lax cookies already stop cross-site form posts; the origin check also
// rejects cross-site fetches that would spend this owner's quota.
function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin;
}

async function readJson(request) {
  if (!(request.headers.get("content-type") || "").includes("application/json")) return null;
  return request.json().catch(() => null);
}

async function handleCreate(request, env) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin requests are not allowed" }, 403);
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const { success } = await env.CREATE_LIMIT.limit({ key: ip });
  if (!success) return json({ error: "Too many generations at once. Try again in a minute." }, 429);

  const owner = await resolveOwner(request);
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await env.DB.prepare("SELECT COUNT(*) AS count FROM jobs WHERE owner_hash = ? AND created_at > ?").bind(owner.hash, since).first();
  if (count >= DAILY_JOBS_PER_OWNER) return json({ error: "Daily generation limit reached. Come back tomorrow." }, 429);

  const headers = owner.setCookie ? { "set-cookie": owner.setCookie } : {};
  try {
    const job = await createJob(env, owner.hash, await readJson(request));
    return json({ job }, 201, headers);
  } catch (error) {
    if (error instanceof AccessError) return json({ code: error.code, error: error.message, usage: error.details }, 402, headers);
    if (error instanceof UserError) return json({ code: error.code, error: error.message }, 422, headers);
    logError({ error: error.message, message: "job failed", stack: error.stack });
    return json({ error: "Generation failed. The page may use a layout Skeleton Motion cannot read yet." }, 500, headers);
  }
}

const KEY_BODY_LIMIT = 4096;
const ACCESS_STATUS = { "invalid-key-settings": 400, "key-rejected": 400, "key-unverified": 503, "own-keys-unavailable": 503 };

// Handles a visitor's own AI key. Nothing here logs: the request body holds
// the key, and every failure path returns a fixed message.
async function handleSaveKey(request, env) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin requests are not allowed" }, 403);
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (!(await env.CREATE_LIMIT.limit({ key: `ai-key:${ip}` })).success) return json({ error: "Too many attempts. Try again in a minute." }, 429);
  if (Number(request.headers.get("content-length") || 0) > KEY_BODY_LIMIT) return json({ error: "Request too large." }, 413);
  let input = null;
  try {
    const text = await request.text();
    if (text.length <= KEY_BODY_LIMIT) input = JSON.parse(text);
  } catch {
    // Parse errors can quote the input, so they are dropped, never logged.
  }
  if (!input || typeof input !== "object") return json({ error: "Send the provider and key as JSON." }, 400);
  const owner = await resolveOwner(request);
  const headers = owner.setCookie ? { "set-cookie": owner.setCookie } : {};
  try {
    return json({ ownKey: await saveOwnKey(env, owner.hash, input) }, 200, headers);
  } catch (error) {
    if (error instanceof AccessError) return json({ code: error.code, error: error.message }, ACCESS_STATUS[error.code] ?? 400, headers);
    return json({ error: "The key could not be saved. Try again." }, 500, headers);
  }
}

async function handleDeleteKey(request, env) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin requests are not allowed" }, 403);
  const token = readOwnerToken(request);
  if (token) await deleteOwnKey(env, await hashToken(token));
  return json({ ownKey: null });
}

async function handleGallery(request, env, url) {
  if (url.searchParams.get("scope") === "all") return json(await listPublicJobs(env, url.searchParams.get("before")));
  const token = readOwnerToken(request);
  if (!token) return json({ jobs: [], recoveryToken: null });
  return json({ jobs: await listJobs(env, await hashToken(token)), recoveryToken: token });
}

async function handleRestore(request, env) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin requests are not allowed" }, 403);
  const token = (await readJson(request))?.token;
  if (!isOwnerToken(token)) return json({ error: "That gallery link is not valid" }, 400);
  const jobs = await listJobs(env, await hashToken(token));
  return json({ jobs: jobs.length }, 200, { "set-cookie": ownerCookie(token) });
}

async function handleVisibility(request, env, id) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin requests are not allowed" }, 403);
  const token = readOwnerToken(request);
  const visibility = (await readJson(request))?.visibility;
  if (!token || !(await setVisibility(env, await hashToken(token), id, visibility))) return json({ error: "Only the browser that made this generation can change it" }, 404);
  return json({ id, visibility });
}

async function handleJobFile(request, env, url) {
  const [, id, file] = url.pathname.match(JOB_PATH) || [];
  if (!id || !isJobId(id)) return null;
  if (file === undefined) return Response.redirect(`${url.origin}/jobs/${id}/`, 301);
  const response = await serveJobFile(env, id, file);
  if (!response) return null;
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-robots-tag", "noindex");
  const type = headers.get("content-type") || "";
  if (type.startsWith("image/svg")) headers.set("content-security-policy", SVG_CSP);
  if (type.startsWith("text/html")) headers.set("content-security-policy", ROOM_CSP);
  return new Response(response.body, { headers, status: response.status });
}

export { BrowserGate } from "./browser-gate.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;
    if (route === "POST /api/jobs") return handleCreate(request, env);
    if (route === "GET /api/gallery") return handleGallery(request, env, url);
    if (route === "POST /api/gallery/restore") return handleRestore(request, env);
    if (route === "GET /api/status") return json({ browser: await browserUsage(env), engine: engineVersion(env) });
    if (route === "POST /api/ai/key") return handleSaveKey(request, env);
    if (route === "DELETE /api/ai/key") return handleDeleteKey(request, env);
    if (route === "GET /api/ai/status") {
      const token = readOwnerToken(request);
      return json(await hostedUsage(env, token ? await hashToken(token) : null));
    }
    const visibilityId = request.method === "POST" && url.pathname.match(VISIBILITY_PATH)?.[1];
    if (visibilityId) return handleVisibility(request, env, visibilityId);
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    if (url.pathname.startsWith("/jobs/") && request.method === "GET") {
      const response = await handleJobFile(request, env, url);
      if (response) return response;
    }
    return env.ASSETS.fetch(request);
  },
};

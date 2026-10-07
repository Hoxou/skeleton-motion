import { assertPublicUrl } from "../safe-fetch.js";
import { geminiProvider, openAiCompatibleProvider, verifyKey } from "./providers.js";
import { openSecret, sealSecret } from "./vault.js";

// Who pays for a generation: the shared hosted key (limited free uses per
// browser, plus a global daily ceiling) or the visitor's own key.
//
// A visitor's key arrives once, at POST /api/ai/key, is verified with the
// provider, and is stored only as AES-GCM ciphertext (see vault.js). It is
// decrypted inside the Worker for the provider call and never returned,
// logged, or included in any message. Nothing in this file logs.

const KEY = /^[\x21-\x7e]{16,300}$/;
const MODEL = /^[A-Za-z0-9._:/-]{1,80}$/;
const PROVIDERS = new Set(["gemini", "openai-compatible"]);

export class AccessError extends Error {
  /**
   * @param code "free-uses-exhausted" | "hosted-busy" | "hosted-unavailable"
   *   | "invalid-key-settings" | "key-rejected" | "key-unverified" | "key-unreadable" | "own-keys-unavailable"
   */
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function limits(env) {
  return { dailyAttempts: Number(env.AI_DAILY_ATTEMPTS) || 150, freeUses: Number(env.AI_FREE_USES) || 10 };
}

const today = () => new Date().toISOString().slice(0, 10);

async function keyRow(env, ownerHash) {
  return ownerHash ? env.DB.prepare("SELECT * FROM ai_keys WHERE owner_hash = ?").bind(ownerHash).first() : null;
}

/** Public description of a saved key: never the key or any part of it. */
function describe(row) {
  return row ? { baseHost: row.base_url ? new URL(row.base_url).hostname : null, model: row.model, provider: row.provider, savedAt: row.created_at } : null;
}

export async function hostedUsage(env, ownerHash) {
  const [usage, saved] = await Promise.all([
    ownerHash ? env.DB.prepare("SELECT hosted_uses FROM ai_usage WHERE owner_hash = ?").bind(ownerHash).first() : null,
    keyRow(env, ownerHash),
  ]);
  const { freeUses } = limits(env);
  const used = usage?.hosted_uses ?? 0;
  return { freeUses, hostedAvailable: Boolean(env.GEMINI_API_KEY), ownKey: describe(saved), remaining: Math.max(0, freeUses - used), used };
}

/** Validates visitor settings; error messages never repeat the key. */
export function normalizeSettings(input) {
  const provider = input?.provider;
  if (!PROVIDERS.has(provider)) throw new AccessError("invalid-key-settings", "Choose Gemini or an OpenAI-compatible provider.");
  const key = typeof input?.key === "string" ? input.key.trim() : "";
  if (!KEY.test(key)) throw new AccessError("invalid-key-settings", "That API key does not look valid.");
  const model = typeof input?.model === "string" && input.model.trim() ? input.model.trim() : null;
  if (model && !MODEL.test(model)) throw new AccessError("invalid-key-settings", "That model name does not look valid.");
  if (provider === "gemini") return { baseUrl: null, key, model, provider };
  if (!model) throw new AccessError("invalid-key-settings", "Enter the model name your provider uses.");
  let base;
  try {
    base = assertPublicUrl(typeof input?.baseUrl === "string" && input.baseUrl.trim() ? input.baseUrl.trim() : "https://api.openai.com/v1");
  } catch (error) {
    throw new AccessError("invalid-key-settings", `Provider URL: ${error.message}`);
  }
  if (base.protocol !== "https:") throw new AccessError("invalid-key-settings", "The provider URL must use https.");
  base.search = "";
  base.hash = "";
  return { baseUrl: base.href.replace(/\/+$/, ""), key, model, provider };
}

function providerFor(settings) {
  return settings.provider === "gemini"
    ? geminiProvider({ key: settings.key, model: settings.model || undefined })
    : openAiCompatibleProvider({ baseUrl: settings.baseUrl, key: settings.key, model: settings.model });
}

/**
 * Verifies, encrypts, and stores a visitor's key.
 * @returns the public description, never the key
 */
export async function saveOwnKey(env, ownerHash, input) {
  if (!env.AI_KEY_ENCRYPTION_SECRET) throw new AccessError("own-keys-unavailable", "Saving your own key is not available right now.");
  const settings = normalizeSettings(input);
  const verdict = await verifyKey(settings);
  if (verdict === "rejected") throw new AccessError("key-rejected", "The provider rejected this key. Check it and try again.");
  if (verdict !== "ok") throw new AccessError("key-unverified", "The provider could not be reached to check this key. Try again in a moment.");
  const sealed = await sealSecret(settings.key, { ownerHash, secret: env.AI_KEY_ENCRYPTION_SECRET });
  const savedAt = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO ai_keys (owner_hash, provider, model, base_url, ciphertext, iv, version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (owner_hash) DO UPDATE SET provider = excluded.provider, model = excluded.model, base_url = excluded.base_url, ciphertext = excluded.ciphertext, iv = excluded.iv, version = excluded.version, created_at = excluded.created_at",
  ).bind(ownerHash, settings.provider, settings.model, settings.baseUrl, sealed.ciphertext, sealed.iv, sealed.version, savedAt).run();
  return describe({ base_url: settings.baseUrl, created_at: savedAt, model: settings.model, provider: settings.provider });
}

export async function deleteOwnKey(env, ownerHash) {
  await env.DB.prepare("DELETE FROM ai_keys WHERE owner_hash = ?").bind(ownerHash).run();
}

async function savedProvider(env, ownerHash, row) {
  if (!env.AI_KEY_ENCRYPTION_SECRET) throw new AccessError("own-keys-unavailable", "Your saved key cannot be used right now. Try again later.");
  let key;
  try {
    key = await openSecret({ ciphertext: row.ciphertext, iv: row.iv, version: row.version }, { ownerHash, secret: env.AI_KEY_ENCRYPTION_SECRET });
  } catch {
    // Unreadable (tampered, or the master secret changed): useless, so remove it.
    await deleteOwnKey(env, ownerHash);
    throw new AccessError("key-unreadable", "Your saved key could not be read. Please add it again.");
  }
  return providerFor({ baseUrl: row.base_url, key, model: row.model, provider: row.provider });
}

/**
 * Picks the provider for one generation: the visitor's saved key when there
 * is one, otherwise the shared key within the free uses and daily ceiling.
 * @returns {{ provider, hosted: boolean }}
 */
export async function resolveProvider(env, ownerHash) {
  const saved = await keyRow(env, ownerHash);
  if (saved) return { hosted: false, provider: await savedProvider(env, ownerHash, saved) };
  if (!env.GEMINI_API_KEY) throw new AccessError("hosted-unavailable", "Generation needs an AI key. Add your own to continue.");
  const usage = await hostedUsage(env, ownerHash);
  if (usage.remaining <= 0) {
    throw new AccessError("free-uses-exhausted", `You've used your ${usage.freeUses} free generations. Add your own AI key to keep going.`, usage);
  }
  // The day's ceiling counts attempts, failed ones included, because each
  // one spends the shared key's quota.
  const { dailyAttempts } = limits(env);
  const row = await env.DB.prepare("INSERT INTO ai_daily (day, attempts) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET attempts = attempts + 1 RETURNING attempts").bind(today()).first();
  if (row.attempts > dailyAttempts) {
    throw new AccessError("hosted-busy", "The free AI is at its limit for today. Try again tomorrow or add your own key.", usage);
  }
  return { hosted: true, provider: geminiProvider({ key: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || undefined }) };
}

/** Counts one successful hosted generation against the owner's free uses. */
export async function recordHostedUse(env, ownerHash) {
  await env.DB.prepare("INSERT INTO ai_usage (owner_hash, hosted_uses, updated_at) VALUES (?, 1, ?) ON CONFLICT (owner_hash) DO UPDATE SET hosted_uses = hosted_uses + 1, updated_at = excluded.updated_at")
    .bind(ownerHash, new Date().toISOString()).run();
}

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { AccessError, deleteOwnKey, hostedUsage, normalizeSettings, resolveProvider, saveOwnKey } from "../worker/ai/access.js";
import { ProviderError, request } from "../worker/ai/providers.js";
import { openSecret, sealSecret } from "../worker/ai/vault.js";
import { scrub } from "../worker/log.js";

const SECRET = Buffer.alloc(32, 7).toString("base64");
const OTHER_SECRET = Buffer.alloc(32, 9).toString("base64");
const USER_KEY = "fake-test-key-0123456789abcdefghijklmnop";
const OWNER = "owner-hash-a";

// Minimal stand-in for the D1 statements access.js issues.
function fakeDb() {
  const keys = new Map();
  const usage = new Map();
  return {
    keys,
    prepare(sql) {
      let args = [];
      const statement = {
        bind: (...values) => { args = values; return statement; },
        async first() {
          if (sql.startsWith("SELECT * FROM ai_keys")) return keys.get(args[0]) ?? null;
          if (sql.startsWith("SELECT hosted_uses")) return usage.get(args[0]) ?? null;
          if (sql.startsWith("INSERT INTO ai_daily")) return { attempts: 1 };
          return null;
        },
        async run() {
          if (sql.startsWith("INSERT INTO ai_keys")) {
            const [owner_hash, provider, model, base_url, ciphertext, iv, version, created_at] = args;
            keys.set(owner_hash, { base_url, ciphertext, created_at, iv, model, owner_hash, provider, version });
          }
          if (sql.startsWith("DELETE FROM ai_keys")) keys.delete(args[0]);
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
}

function withFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve(run()).finally(() => { globalThis.fetch = original; });
}

const okFetch = async () => new Response(JSON.stringify({ models: [] }), { status: 200 });
const containsKey = (value) => JSON.stringify(value ?? "").includes(USER_KEY) || JSON.stringify(value ?? "").includes(USER_KEY.slice(-8));

test("sealed keys open only for their owner, with the right secret, untampered", async () => {
  const sealed = await sealSecret(USER_KEY, { ownerHash: OWNER, secret: SECRET });
  assert.equal(await openSecret(sealed, { ownerHash: OWNER, secret: SECRET }), USER_KEY);
  assert.ok(!sealed.ciphertext.includes(USER_KEY));
  await assert.rejects(openSecret(sealed, { ownerHash: "owner-hash-b", secret: SECRET }));
  await assert.rejects(openSecret(sealed, { ownerHash: OWNER, secret: OTHER_SECRET }));
  const flipped = Buffer.from(sealed.ciphertext, "base64");
  flipped[0] ^= 1;
  await assert.rejects(openSecret({ ...sealed, ciphertext: flipped.toString("base64") }, { ownerHash: OWNER, secret: SECRET }));
});

test("encryption refuses a missing or weak master secret instead of storing plain text", async () => {
  await assert.rejects(sealSecret(USER_KEY, { ownerHash: OWNER, secret: "" }));
  await assert.rejects(sealSecret(USER_KEY, { ownerHash: OWNER, secret: Buffer.alloc(8).toString("base64") }));
});

test("a saved key is stored only as ciphertext and never returned", async () => {
  const env = { AI_KEY_ENCRYPTION_SECRET: SECRET, DB: fakeDb() };
  const described = await withFetch(okFetch, () => saveOwnKey(env, OWNER, { key: USER_KEY, provider: "gemini" }));
  assert.equal(containsKey(described), false);
  assert.deepEqual(Object.keys(described).sort(), ["baseHost", "model", "provider", "savedAt"]);
  const row = env.DB.keys.get(OWNER);
  assert.equal(containsKey(row), false);
  const status = await hostedUsage(env, OWNER);
  assert.equal(containsKey(status), false);
  assert.equal(status.ownKey.provider, "gemini");
});

test("a saved key is used for generation and removable", async () => {
  const env = { AI_KEY_ENCRYPTION_SECRET: SECRET, DB: fakeDb() };
  await withFetch(okFetch, () => saveOwnKey(env, OWNER, { key: USER_KEY, provider: "gemini" }));
  const access = await resolveProvider(env, OWNER);
  assert.equal(access.hosted, false);
  assert.equal(containsKey(access.provider.label), false);
  await deleteOwnKey(env, OWNER);
  assert.equal(env.DB.keys.size, 0);
});

test("an unreadable saved key is deleted and the visitor is asked to add it again", async () => {
  const env = { AI_KEY_ENCRYPTION_SECRET: SECRET, DB: fakeDb() };
  await withFetch(okFetch, () => saveOwnKey(env, OWNER, { key: USER_KEY, provider: "gemini" }));
  await assert.rejects(resolveProvider({ ...env, AI_KEY_ENCRYPTION_SECRET: OTHER_SECRET }, OWNER), (error) => error.code === "key-unreadable");
  assert.equal(env.DB.keys.size, 0);
});

test("a rejected key is not stored and the message never repeats it", async () => {
  const env = { AI_KEY_ENCRYPTION_SECRET: SECRET, DB: fakeDb() };
  const echoing = async () => new Response(JSON.stringify({ error: { message: `API key not valid: ${USER_KEY}` } }), { status: 400 });
  await assert.rejects(withFetch(echoing, () => saveOwnKey(env, OWNER, { key: USER_KEY, provider: "gemini" })), (error) => {
    assert.equal(error.code, "key-rejected");
    assert.equal(containsKey(error.message), false);
    return true;
  });
  assert.equal(env.DB.keys.size, 0);
});

test("saving fails closed without the master secret", async () => {
  await assert.rejects(saveOwnKey({ DB: fakeDb() }, OWNER, { key: USER_KEY, provider: "gemini" }), (error) => error.code === "own-keys-unavailable");
});

test("provider error text is scrubbed of the key and redirects are refused", async () => {
  const echoing = async () => new Response(JSON.stringify({ error: { message: `bad auth for ${USER_KEY}` } }), { status: 403 });
  await assert.rejects(withFetch(echoing, () => request("https://api.example.com/x", { headers: {}, secret: USER_KEY })), (error) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(containsKey(error.message), false);
    return true;
  });
  let followed = false;
  const redirecting = async (_url, init) => {
    followed = init.redirect !== "manual";
    return new Response(null, { headers: { location: "https://elsewhere.example/" }, status: 302 });
  };
  await assert.rejects(withFetch(redirecting, () => request("https://api.example.com/x", { headers: {}, secret: USER_KEY })), /redirect/);
  assert.equal(followed, false);
});

test("own-key settings reject unsafe provider URLs and malformed keys without echoing them", () => {
  for (const baseUrl of ["http://api.example.com/v1", "https://127.0.0.1/v1", "https://localhost/v1", "https://10.0.0.2/v1"]) {
    assert.throws(() => normalizeSettings({ baseUrl, key: USER_KEY, model: "m", provider: "openai-compatible" }), AccessError);
  }
  assert.throws(() => normalizeSettings({ key: "short", provider: "gemini" }), (error) => !error.message.includes("short"));
  assert.throws(() => normalizeSettings({ key: USER_KEY, provider: "unknown" }), AccessError);
});

test("the log redactor hides anything shaped like a credential", () => {
  const cleaned = scrub({ nested: [`token ${USER_KEY} here`], reason: `Bearer ${USER_KEY}` });
  assert.equal(containsKey(cleaned), false);
  assert.match(cleaned.reason, /\[redacted\]/);
});

test("Worker code logs only through the redacting helper", async () => {
  const root = new URL("../worker/", import.meta.url);
  const files = [];
  const walk = async (dir) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".js")) files.push(full);
    }
  };
  await walk(root.pathname);
  for (const file of files) {
    if (file.endsWith(`${path.sep}log.js`)) continue;
    assert.doesNotMatch(await fs.readFile(file, "utf8"), /console\.\w+\(/, `${path.relative(root.pathname, file)} logs without redaction`);
  }
  const index = await fs.readFile(new URL("../worker/index.js", import.meta.url), "utf8");
  const saveKey = index.slice(index.indexOf("async function handleSaveKey"), index.indexOf("async function handleDeleteKey"));
  assert.doesNotMatch(saveKey, /log(Error|Warning)\(/, "the key route must not log at all");
});

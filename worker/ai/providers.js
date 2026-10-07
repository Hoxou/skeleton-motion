import { scrub } from "../log.js";

// Model adapters. Each takes a system prompt and a user prompt and returns
// the parsed JSON object the model produced. Keys are used for the single
// request they arrive with and are never logged or stored.

const TIMEOUT_MS = 90_000;

export class ProviderError extends Error {
  /** @param kind "auth" | "rate-limited" | "unavailable" | "bad-output" */
  constructor(kind, message, status = 0) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

function kindForStatus(status) {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate-limited";
  return "unavailable";
}

// Models sometimes wrap JSON in a fenced block even when asked not to.
export function parseJsonReply(text) {
  const trimmed = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // Fall through to the error below.
      }
    }
    throw new ProviderError("bad-output", "The model did not return valid JSON.");
  }
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
// Busy and overloaded answers are usually momentary; anything else is final.
const RETRY_DELAYS = Object.freeze({ 429: [5_000], 500: [2_000], 502: [2_000], 503: [2_000], 504: [2_000] });

// Provider text may echo request details; the key and anything shaped like a
// credential are removed before the text goes anywhere.
function cleanReason(text, secret) {
  return scrub(String(text || "").split(secret || "\u0000").join("[redacted]")).slice(0, 160);
}

/**
 * `secret` is the credential in `headers`; it is stripped from any text the
 * provider sends back. Redirects are refused so the credential header can
 * never follow a response to another host.
 */
export async function request(url, { body, headers, method = "POST", secret }) {
  for (let attempt = 0; ; attempt += 1) {
    let response;
    try {
      response = await fetch(url, { body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json", ...headers }, method, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      throw new ProviderError("unavailable", error.name === "TimeoutError" ? "The AI provider took too long to answer." : "The AI provider could not be reached.");
    }
    const payload = await response.json().catch(() => null);
    if (response.ok) return payload;
    const delay = RETRY_DELAYS[response.status]?.[attempt];
    if (delay !== undefined) {
      await sleep(delay);
      continue;
    }
    if (response.status >= 300 && response.status < 400) throw new ProviderError("unavailable", "The AI provider redirected the request; redirects are not followed.", response.status);
    const reason = cleanReason(payload?.error?.message || payload?.message || response.statusText, secret);
    throw new ProviderError(kindForStatus(response.status), `The AI provider answered ${response.status}${reason ? `: ${reason}` : ""}`, response.status);
  }
}

// Worth trying the next model: this one is overloaded or retired.
const tryNextModel = (error) => error instanceof ProviderError && (error.status === 404 || error.status >= 500);

/**
 * @param model one model id or a comma-separated fallback list, tried in
 *   order while a model is overloaded or no longer offered.
 */
export function geminiProvider({ key, model = "gemini-3.8-flash,gemini-3.7-flash,gemini-flash-latest" }) {
  const models = String(model).split(",").map((name) => name.trim()).filter(Boolean);
  let current = models[0];
  return {
    get label() {
      return `Gemini (${current})`;
    },
    async json({ system, user }) {
      let lastError;
      for (const name of models) {
        current = name;
        try {
          const payload = await request(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(name)}:generateContent`, {
            body: {
              contents: [{ parts: [{ text: user }], role: "user" }],
              generationConfig: { maxOutputTokens: 16384, responseMimeType: "application/json", temperature: 0.8 },
              systemInstruction: { parts: [{ text: system }] },
            },
            headers: { "x-goog-api-key": key },
            secret: key,
          });
          const candidate = payload?.candidates?.[0];
          const text = (candidate?.content?.parts || []).map((part) => part.text || "").join("");
          if (!text) throw new ProviderError("bad-output", `The model returned no content${candidate?.finishReason ? ` (${candidate.finishReason})` : ""}.`);
          return { data: parseJsonReply(text), usage: payload.usageMetadata || null };
        } catch (error) {
          lastError = error;
          if (!tryNextModel(error)) throw error;
        }
      }
      throw lastError;
    },
  };
}

// OpenAI, DeepSeek, Qwen, OpenRouter, and others share this request shape.
export function openAiCompatibleProvider({ baseUrl, key, model }) {
  const root = String(baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  return {
    label: `${new URL(root).hostname} (${model})`,
    async json({ system, user }) {
      const payload = await request(`${root}/chat/completions`, {
        body: {
          messages: [{ content: system, role: "system" }, { content: user, role: "user" }],
          model,
          response_format: { type: "json_object" },
          temperature: 0.8,
        },
        headers: { authorization: `Bearer ${key}` },
        secret: key,
      });
      const text = payload?.choices?.[0]?.message?.content;
      if (!text) throw new ProviderError("bad-output", "The model returned no content.");
      return { data: parseJsonReply(text), usage: payload.usage || null };
    },
  };
}

/**
 * Checks a visitor's key with a free listing call before it is stored.
 * @returns "ok" | "rejected" | "unreachable"
 */
export async function verifyKey(settings) {
  const target = settings.provider === "gemini"
    ? { headers: { "x-goog-api-key": settings.key }, url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1" }
    : { headers: { authorization: `Bearer ${settings.key}` }, url: `${String(settings.baseUrl).replace(/\/+$/, "")}/models` };
  try {
    await request(target.url, { headers: target.headers, method: "GET", secret: settings.key });
    return "ok";
  } catch (error) {
    // Gemini reports an invalid key as 400, others as 401 or 403.
    return error instanceof ProviderError && [400, 401, 403].includes(error.status) ? "rejected" : "unreachable";
  }
}

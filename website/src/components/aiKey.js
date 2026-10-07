// A visitor's own AI key is sent once to the server, which verifies it and
// stores it encrypted. The browser never keeps it and never gets it back:
// only the provider, model, and save date come back for display.

export const PROVIDERS = Object.freeze({
  gemini: { label: "Gemini", modelHint: "Optional, defaults to the latest Flash" },
  "openai-compatible": { label: "OpenAI-compatible", modelHint: "Required, for example gpt-5.4-nano or deepseek-chat" },
});

async function send(method, body) {
  const response = await fetch("/api/ai/key", {
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "content-type": "application/json" } : undefined,
    method,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload.ownKey;
}

export const saveAiKey = (settings) => send("POST", settings);
export const removeAiKey = () => send("DELETE");

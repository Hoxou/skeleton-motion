const MAX_REDIRECTS = 4;
const PRIVATE_HOST = /^(?:localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function isPrivateIpv4(host) {
  const [a, b] = host.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/**
 * Accepts only public http(s) URLs on default ports. Throws a user-facing
 * error otherwise.
 */
export function assertPublicUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a full URL, for example https://example.com");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http and https URLs are supported");
  if (url.username || url.password) throw new Error("URLs with credentials are not supported");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("Only default web ports are supported");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  // IPv6 literals are rejected outright rather than range-checked.
  if (host.includes(":") || PRIVATE_HOST.test(host) || (IPV4.test(host) && isPrivateIpv4(host)) || !host.includes(".")) {
    throw new Error("That address is not a public website");
  }
  return url;
}

async function readCapped(response, maxBytes) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error(`Page is larger than ${Math.round(maxBytes / 1_000_000)} MB`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Builds a fetch replacement for the analyzer. It re-validates every redirect
 * hop, bounds time and body size, and returns only the response fields the
 * analyzer reads (`ok`, `status`, `url`, `text()`).
 */
export function createSafeFetch({ maxBytes = 3_000_000, timeoutMs = 8_000, fetchImpl = fetch } = {}) {
  return async function safeFetch(input, init = {}) {
    let url = assertPublicUrl(String(input));
    const signal = AbortSignal.timeout(timeoutMs);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await fetchImpl(url.href, { headers: init.headers, redirect: "manual", signal });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        url = assertPublicUrl(new URL(location, url).href);
        continue;
      }
      const text = await readCapped(response, maxBytes);
      return { ok: response.ok, status: response.status, text: async () => text, url: url.href };
    }
    throw new Error("Too many redirects");
  };
}

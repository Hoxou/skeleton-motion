const COOKIE = "sm_owner";
const ONE_YEAR = 60 * 60 * 24 * 365;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function newToken(bytes = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function isOwnerToken(value) {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

// D1 stores only the hash, so a database read never yields a usable gallery key.
export async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return base64Url(new Uint8Array(digest));
}

export function readOwnerToken(request) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return match && isOwnerToken(match[1]) ? match[1] : null;
}

export function ownerCookie(token) {
  return `${COOKIE}=${token}; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; Secure; SameSite=Lax`;
}

/**
 * Returns the request's anonymous owner, minting one when the browser has
 * none. `setCookie` is non-null only when the caller must send it back.
 */
export async function resolveOwner(request) {
  const existing = readOwnerToken(request);
  const token = existing || newToken();
  return { hash: await hashToken(token), setCookie: existing ? null : ownerCookie(token), token };
}

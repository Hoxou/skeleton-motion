// Encryption for visitors' own AI keys at rest.
//
// AES-256-GCM with a per-owner key derived (HKDF-SHA256) from the master
// secret AI_KEY_ENCRYPTION_SECRET, which only exists as a Worker secret. The
// owner hash is mixed into the derivation and bound as additional
// authenticated data, so a row copied to another owner cannot be decrypted,
// and any tampering makes decryption fail instead of yielding a wrong key.

export const VAULT_VERSION = 1;
const encoder = new TextEncoder();

function base64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function unbase64(text) {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

function masterBytes(secret) {
  let bytes;
  try {
    bytes = unbase64(String(secret || ""));
  } catch {
    bytes = new Uint8Array();
  }
  // Fail closed: a missing or weak master secret never falls back to plain text.
  if (bytes.length < 32) throw new Error("AI key encryption is not configured.");
  return bytes;
}

async function ownerKey(secret, ownerHash, usage) {
  const material = await crypto.subtle.importKey("raw", masterBytes(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { hash: "SHA-256", info: encoder.encode(`skeleton-motion/ai-key/v${VAULT_VERSION}`), name: "HKDF", salt: encoder.encode(ownerHash) },
    material,
    { length: 256, name: "AES-GCM" },
    false,
    [usage],
  );
}

/** @returns {{ ciphertext: string, iv: string, version: number }} base64 fields */
export async function sealSecret(plaintext, { ownerHash, secret }) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await ownerKey(secret, ownerHash, "encrypt");
  const sealed = await crypto.subtle.encrypt({ additionalData: encoder.encode(ownerHash), iv, name: "AES-GCM" }, key, encoder.encode(plaintext));
  return { ciphertext: base64(new Uint8Array(sealed)), iv: base64(iv), version: VAULT_VERSION };
}

/** Throws when the row was tampered with or belongs to another owner. */
export async function openSecret({ ciphertext, iv, version }, { ownerHash, secret }) {
  if (version !== VAULT_VERSION) throw new Error("Unsupported AI key encryption version.");
  const key = await ownerKey(secret, ownerHash, "decrypt");
  const opened = await crypto.subtle.decrypt({ additionalData: encoder.encode(ownerHash), iv: unbase64(iv), name: "AES-GCM" }, key, unbase64(ciphertext));
  return new TextDecoder().decode(opened);
}

import assert from "node:assert/strict";
import test from "node:test";
import { hashToken, isOwnerToken, readOwnerToken, resolveOwner } from "../worker/owner.js";
import { assertPublicUrl, createSafeFetch } from "../worker/safe-fetch.js";

const blocked = {
  "credentials in the URL": "https://user:pass@example.com",
  "file scheme": "file:///etc/passwd",
  "IPv6 loopback": "http://[::1]/",
  "link-local metadata address": "http://169.254.169.254/latest/meta-data",
  "localhost": "http://localhost/",
  "non-default port": "https://example.com:8443/",
  "private 10/8 address": "http://10.0.0.5/",
  "private 192.168/16 address": "http://192.168.1.1/",
  "single-label host": "http://intranet/",
};

for (const [label, url] of Object.entries(blocked)) {
  test(`rejects ${label}`, () => {
    assert.throws(() => assertPublicUrl(url));
  });
}

test("accepts public http and https URLs", () => {
  assert.equal(assertPublicUrl("https://example.com/path?q=1").hostname, "example.com");
  assert.equal(assertPublicUrl("http://93.184.216.34/").hostname, "93.184.216.34");
});

function fakeFetch(routes) {
  return async (url) => {
    const route = routes[url];
    if (!route) throw new Error(`unexpected fetch ${url}`);
    return new Response(route.body ?? "", { headers: route.headers, status: route.status ?? 200 });
  };
}

test("safe fetch follows public redirects and reports the final URL", async () => {
  const safeFetch = createSafeFetch({
    fetchImpl: fakeFetch({
      "https://example.com/": { headers: { location: "/home" }, status: 301 },
      "https://example.com/home": { body: "<title>Home</title>" },
    }),
  });
  const response = await safeFetch("https://example.com/");
  assert.equal(response.url, "https://example.com/home");
  assert.equal(await response.text(), "<title>Home</title>");
});

test("safe fetch refuses a redirect into a private network", async () => {
  const safeFetch = createSafeFetch({
    fetchImpl: fakeFetch({ "https://example.com/": { headers: { location: "http://127.0.0.1/admin" }, status: 302 } }),
  });
  await assert.rejects(safeFetch("https://example.com/"), /not a public website/);
});

test("safe fetch stops reading bodies over the size cap", async () => {
  const safeFetch = createSafeFetch({ fetchImpl: fakeFetch({ "https://example.com/": { body: "x".repeat(2_000) } }), maxBytes: 1_000 });
  await assert.rejects(safeFetch("https://example.com/"), /larger than/);
});

test("mints an owner cookie only for browsers without one", async () => {
  const fresh = await resolveOwner(new Request("https://app.test/"));
  assert.ok(isOwnerToken(fresh.token));
  assert.match(fresh.setCookie, /^sm_owner=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=\d+; HttpOnly; Secure; SameSite=Lax$/);

  const returning = await resolveOwner(new Request("https://app.test/", { headers: { cookie: `theme=dark; sm_owner=${fresh.token}` } }));
  assert.equal(returning.setCookie, null);
  assert.equal(returning.hash, fresh.hash);
  assert.notEqual(returning.hash, fresh.token);
});

test("ignores malformed owner cookies", async () => {
  assert.equal(readOwnerToken(new Request("https://app.test/", { headers: { cookie: "sm_owner=short" } })), null);
  assert.equal(await hashToken("a"), await hashToken("a"));
});

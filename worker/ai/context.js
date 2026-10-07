// Builds the product summary the designer reads: what the page says about
// itself, plus a repository's structure when the source is a GitHub repo.

const ENTITIES = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: "\"" };
const decode = (text) => text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, name) => {
  if (name[0] === "#") {
    const code = name[1] === "x" || name[1] === "X" ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
    return Number.isFinite(code) && code > 31 ? String.fromCodePoint(code) : " ";
  }
  return ENTITIES[name.toLowerCase()] ?? match;
});
const textOf = (html) => decode(html.replace(/<[^>]+>/g, " ")).replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim();
const unique = (values, max, length) => [...new Set(values.map((value) => value.slice(0, length)).filter((value) => value.length > 1))].slice(0, max);

/** Readable content of a server-rendered page. */
export function pageDigest(html) {
  const source = String(html || "");
  const body = source.replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ");
  const all = (pattern) => [...body.matchAll(pattern)].map((match) => textOf(match[1]));
  return {
    actions: unique(all(/<(?:button|a)\b[^>]*>([\s\S]*?)<\/(?:button|a)>/gi).filter((text) => text.length <= 40), 30, 40),
    description: textOf(source.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || source.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i)?.[1] || ""),
    headings: unique(all(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi), 24, 120),
    text: textOf(body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || body.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] || body).slice(0, 6000),
    title: textOf(source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").slice(0, 120),
  };
}

// A page shipped as an empty app shell says almost nothing until it renders.
export function isThin(digest) {
  return (digest.text || "").length < 800 || (digest.headings || []).length < 2;
}

export function githubRepo(url) {
  if (url.hostname !== "github.com") return null;
  const [owner, repo] = url.pathname.split("/").filter(Boolean);
  return owner && repo && /^[\w.-]+$/.test(owner) && /^[\w.-]+$/.test(repo) ? { owner, repo: repo.replace(/\.git$/, "") } : null;
}

// Paths that say what a product does: routes, pages, features, models.
const MEANINGFUL = /(?:^|\/)(?:app|pages|routes|features|screens|views|components|models|api|src)\//i;

/**
 * Public repository summary via unauthenticated GitHub requests. Each part
 * is optional: rate limits or a missing README just leave it out.
 * @param fetchJson (url) => parsed JSON or null; fetchText (url) => string or null
 */
export async function repoContext({ owner, repo }, { fetchJson, fetchText }) {
  const meta = await fetchJson(`https://api.github.com/repos/${owner}/${repo}`);
  const branch = meta?.default_branch || "HEAD";
  const [tree, readme] = await Promise.all([
    fetchJson(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`),
    fetchText(`https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/README.md`),
  ]);
  const paths = (tree?.tree || [])
    .filter((entry) => entry.type === "blob" && MEANINGFUL.test(entry.path) && !/(?:test|spec|stories|fixtures?|__)/i.test(entry.path))
    .map((entry) => entry.path)
    .slice(0, 160);
  return {
    description: String(meta?.description || "").slice(0, 300),
    homepage: typeof meta?.homepage === "string" && /^https?:\/\//.test(meta.homepage) ? meta.homepage : null,
    name: `${owner}/${repo}`,
    paths,
    readme: readme ? textOf(readme.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")).slice(0, 4000) : "",
  };
}

// Public pages that say what the product does, best first. Account, legal,
// and company pages describe nothing a story can show.
const PRODUCT_PATH = /\/(?:products?|features?|platform|solutions?|use-cases?|how-it-works|tour|overview|integrations?|templates?|workflows?)(?:[/-]|$)/i;
const REFERENCE_PATH = /\/(?:changelog|whats-new|docs?|guides?)(?:[/-]|$)/i;
const WEAK_PATH = /\/(?:pricing|customers?|apps?)(?:[/-]|$)/i;
const SKIP_PATH = /(?:log-?in|sign-?in|sign-?up|register|account|auth|oauth|sso|legal|privacy|terms|cookies?|careers|jobs|press|investors|status|contact|download|\.(?:pdf|zip|png|jpe?g|svg|xml)$)/i;
const siteOf = (host) => host.toLowerCase().replace(/^www\./, "");

/**
 * Same-site links (the host or its subdomains) worth reading for product
 * context, ranked by how product-like their path and text are.
 * @returns string[] absolute https URLs without query or fragment
 */
export function productLinks(html, base, max = 3) {
  const root = new URL(base);
  const site = siteOf(root.hostname);
  const seen = new Map();
  for (const match of String(html || "").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (match[1].startsWith("#")) continue;
    let url;
    try {
      url = new URL(decode(match[1]), root);
    } catch {
      continue;
    }
    const host = siteOf(url.hostname);
    if (url.protocol !== "https:" || (host !== site && !host.endsWith(`.${site}`))) continue;
    url.search = "";
    url.hash = "";
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === (root.pathname.replace(/\/+$/, "") || "/") && host === siteOf(root.hostname)) continue;
    if (SKIP_PATH.test(path) || SKIP_PATH.test(host)) continue;
    const depth = path.split("/").filter(Boolean).length;
    const score = (PRODUCT_PATH.test(path) ? 4 : REFERENCE_PATH.test(path) ? 3 : WEAK_PATH.test(path) ? 2 : 0) + (host !== site ? 1 : 0) + (depth <= 2 ? 1 : 0) + (textOf(match[2]).length > 2 ? 0.5 : 0) - (/\/\d{4}\/|\/blog\//.test(path) ? 2 : 0);
    const key = url.href.replace(/\/+$/, "");
    seen.set(key, Math.max(seen.get(key) ?? -Infinity, score));
  }
  return [...seen].filter(([, score]) => score >= 3).sort((a, b) => b[1] - a[1] || a[0].length - b[0].length).slice(0, max).map(([href]) => href);
}

/** A short digest of a secondary page: where it is and what it is about. */
export function pageSummary(html, url) {
  const digest = pageDigest(html);
  const target = new URL(url);
  return { headings: digest.headings.slice(0, 8), path: `${target.hostname.replace(/^www\./, "")}${target.pathname}`.replace(/\/$/, ""), title: digest.title };
}

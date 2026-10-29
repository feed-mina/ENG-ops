import { readFile, readdir, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";

export const DEFAULT_PUBLIC_SITE_URL = "https://harmony-work.pages.dev";
export const PUBLIC_ROUTES = Object.freeze([
  Object.freeze({ pathname: "/", file: "index.html" }),
  Object.freeze({ pathname: "/privacy", file: "privacy.html" })
]);

const URL_PLACEHOLDER = "__PUBLIC_SITE_URL__";
const JSON_LD_PLACEHOLDER = "__PUBLIC_SITE_JSON_LD__";
const FORBIDDEN_SITEMAP_PATHS = Object.freeze(["/admin", "/api", "/ops-web"]);
const EXPECTED_REDIRECT_RULES = Object.freeze(["/index.html / 301", "/privacy.html /privacy 301"]);

export function resolvePublicSiteUrl(value = process.env.PUBLIC_SITE_URL ?? DEFAULT_PUBLIC_SITE_URL) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("PUBLIC_SITE_URL must not be empty");
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch (cause) {
    throw new Error("PUBLIC_SITE_URL must be a valid absolute URL", { cause });
  }
  if (parsed.protocol !== "https:") throw new Error("PUBLIC_SITE_URL must use https");
  if (parsed.username || parsed.password) throw new Error("PUBLIC_SITE_URL must not contain credentials");
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("PUBLIC_SITE_URL must be an origin without a path, query, or fragment");
  }
  if (parsed.hostname.endsWith(".")) throw new Error("PUBLIC_SITE_URL hostname must not end with a dot");
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (
    isIP(hostname) !== 0
    || hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || !hostname.includes(".")
  ) {
    throw new Error("PUBLIC_SITE_URL must use a public DNS hostname");
  }
  if (parsed.hostname === "workers.dev" || parsed.hostname.endsWith(".workers.dev")) {
    throw new Error("PUBLIC_SITE_URL must not use an internal workers.dev hostname");
  }
  return parsed.origin;
}

export function makePublicStructuredData(siteUrl) {
  const origin = resolvePublicSiteUrl(siteUrl);
  return Object.freeze({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "하모니직업소개소",
    url: `${origin}/`,
    telephone: "+82-10-9124-2537",
    image: `${origin}/assets/harmony-office.png`,
    // 등록증 원본 대조(2026-07-17)를 마친 도로명주소만 발행한다. 지번·우편번호·영업시간은 원본 미확인이라 제외.
    address: Object.freeze({
      "@type": "PostalAddress",
      addressCountry: "KR",
      addressRegion: "서울특별시",
      addressLocality: "동작구",
      streetAddress: "남부순환로 2069"
    }),
    areaServed: Object.freeze(["서울특별시 동작구", "서울특별시 관악구", "서울특별시 서초구"])
  });
}

function matches(source, expression) {
  const flags = expression.flags.includes("g") ? expression.flags : `${expression.flags}g`;
  return [...source.matchAll(new RegExp(expression.source, flags))];
}

function one(source, expression, label, file) {
  const found = matches(source, expression);
  if (found.length !== 1) throw new Error(`${file}: expected exactly one ${label}, found ${found.length}`);
  return found[0][1];
}

function pageUrl(origin, pathname) {
  return new URL(pathname, `${origin}/`).href;
}

async function listHtmlDocuments(directory, relativeDirectory = "") {
  const documents = [];
  for (const entry of await readdir(path.join(directory, relativeDirectory), { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) documents.push(...await listHtmlDocuments(directory, relativePath));
    else if (/\.(?:html?|xhtml)$/i.test(entry.name)) documents.push(relativePath.split(path.sep).join("/"));
  }
  return documents.sort();
}

export async function validatePublicSeoBuild({ outputDir, siteUrl }) {
  const origin = resolvePublicSiteUrl(siteUrl);
  const titles = new Set();
  const descriptions = new Set();
  const expectedHtmlDocuments = [...PUBLIC_ROUTES.map((route) => route.file), "404.html"].sort();
  const htmlDocuments = await listHtmlDocuments(outputDir);
  if (JSON.stringify(htmlDocuments) !== JSON.stringify(expectedHtmlDocuments)) {
    throw new Error(`public output contains unregistered HTML documents: ${htmlDocuments.join(", ")}`);
  }

  for (const route of PUBLIC_ROUTES) {
    const source = await readFile(path.join(outputDir, route.file), "utf8");
    if (!/<html\s+lang="ko">/i.test(source)) throw new Error(`${route.file}: html lang must be ko`);
    if (/\bnoindex\b/i.test(source)) throw new Error(`${route.file}: public route must remain indexable`);
    if (source.includes(URL_PLACEHOLDER) || source.includes(JSON_LD_PLACEHOLDER)) {
      throw new Error(`${route.file}: unresolved SEO placeholder`);
    }

    const title = one(source, /<title>([^<]+)<\/title>/i, "title", route.file);
    const description = one(source, /<meta\s+name="description"\s+content="([^"]+)"\s*\/>/i, "description", route.file);
    const canonical = one(source, /<link\s+rel="canonical"\s+href="([^"]+)"\s*\/>/i, "canonical", route.file);
    const openGraphUrl = one(source, /<meta\s+property="og:url"\s+content="([^"]+)"\s*\/>/i, "Open Graph URL", route.file);
    const expectedUrl = pageUrl(origin, route.pathname);
    if (canonical !== expectedUrl || openGraphUrl !== expectedUrl) {
      throw new Error(`${route.file}: canonical and Open Graph URL must equal ${expectedUrl}`);
    }
    if (titles.has(title)) throw new Error(`${route.file}: duplicate title`);
    if (descriptions.has(description)) throw new Error(`${route.file}: duplicate description`);
    titles.add(title);
    descriptions.add(description);
  }

  const home = await readFile(path.join(outputDir, "index.html"), "utf8");
  const structuredDataSource = one(
    home,
    /<script\s+type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/i,
    "JSON-LD block",
    "index.html"
  );
  const structuredData = JSON.parse(structuredDataSource);
  const expectedStructuredData = makePublicStructuredData(origin);
  if (JSON.stringify(structuredData) !== JSON.stringify(expectedStructuredData)) {
    throw new Error("index.html: JSON-LD must contain only the approved LocalBusiness fields");
  }

  const notFound = await readFile(path.join(outputDir, "404.html"), "utf8");
  if (!/<meta\s+name="robots"\s+content="noindex, follow"\s*\/>/i.test(notFound)) {
    throw new Error("404.html: noindex, follow is required");
  }
  if (/rel="canonical"/i.test(notFound)) throw new Error("404.html: canonical is not allowed");

  const sitemap = await readFile(path.join(outputDir, "sitemap.xml"), "utf8");
  const sitemapUrls = matches(sitemap, /<loc>([^<]+)<\/loc>/i).map((match) => match[1]);
  const expectedSitemapUrls = PUBLIC_ROUTES.map((route) => pageUrl(origin, route.pathname));
  if (JSON.stringify(sitemapUrls) !== JSON.stringify(expectedSitemapUrls)) {
    throw new Error("sitemap.xml: only the registered public routes are allowed");
  }
  for (const route of PUBLIC_ROUTES) {
    const expectedUrl = pageUrl(origin, route.pathname);
    if (!sitemap.includes(`<loc>${expectedUrl}</loc>`)) throw new Error(`sitemap.xml: missing ${expectedUrl}`);
  }
  for (const forbidden of FORBIDDEN_SITEMAP_PATHS) {
    if (sitemap.includes(forbidden)) throw new Error(`sitemap.xml: internal path is forbidden: ${forbidden}`);
  }
  const robots = await readFile(path.join(outputDir, "robots.txt"), "utf8");
  if (!robots.includes(`Sitemap: ${origin}/sitemap.xml`)) throw new Error("robots.txt: sitemap origin mismatch");
  const privacy = await readFile(path.join(outputDir, "privacy.html"), "utf8");
  if (/application\/ld\+json/i.test(privacy)) throw new Error("privacy.html: JSON-LD is only allowed on the home page");
  const redirects = (await readFile(path.join(outputDir, "_redirects"), "utf8"))
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);
  if (JSON.stringify(redirects) !== JSON.stringify(EXPECTED_REDIRECT_RULES)) {
    throw new Error("_redirects: only the two canonical HTML alias redirects are allowed");
  }
  return Object.freeze({ siteUrl: origin, routes: PUBLIC_ROUTES.length });
}

export async function finalizePublicSeo({
  outputDir,
  siteUrl = process.env.PUBLIC_SITE_URL ?? DEFAULT_PUBLIC_SITE_URL
}) {
  const origin = resolvePublicSiteUrl(siteUrl);
  const structuredData = JSON.stringify(makePublicStructuredData(origin), null, 2).replaceAll("<", "\\u003c");

  for (const route of PUBLIC_ROUTES) {
    const filePath = path.join(outputDir, route.file);
    let source = await readFile(filePath, "utf8");
    if (!source.includes(URL_PLACEHOLDER)) throw new Error(`${route.file}: PUBLIC_SITE_URL placeholder is required`);
    if (route.pathname === "/" && !source.includes(JSON_LD_PLACEHOLDER)) {
      throw new Error("index.html: JSON-LD placeholder is required");
    }
    source = source.replaceAll(URL_PLACEHOLDER, origin);
    if (route.pathname === "/") source = source.replace(JSON_LD_PLACEHOLDER, structuredData);
    await writeFile(filePath, source, "utf8");
  }

  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
  const sitemapEntries = PUBLIC_ROUTES
    .map((route) => `  <url>\n    <loc>${pageUrl(origin, route.pathname)}</loc>\n  </url>`)
    .join("\n");
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries}\n</urlset>\n`;
  await Promise.all([
    writeFile(path.join(outputDir, "robots.txt"), robots, "utf8"),
    writeFile(path.join(outputDir, "sitemap.xml"), sitemap, "utf8")
  ]);

  return validatePublicSeoBuild({ outputDir, siteUrl: origin });
}

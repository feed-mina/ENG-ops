import assert from "node:assert/strict";
import { access, cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  finalizePublicSeo,
  resolvePublicSiteUrl,
  validatePublicSeoBuild
} from "../scripts/public-seo.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicSource = path.join(root, "apps", "public-site");
const publicOutput = path.join(root, "dist", "public-site");
const expectedOrigin = resolvePublicSiteUrl(process.env.PUBLIC_SITE_URL ?? "https://harmony-work.pages.dev");
const publicPages = [
  { file: "index.html", pathname: "/" },
  { file: "privacy.html", pathname: "/privacy" }
];
const allHtmlFiles = [...publicPages.map(({ file }) => file), "404.html"];

function tags(html, tagName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi"))].map((match) => match[0]);
}

function attributes(tag) {
  const result = new Map();
  const body = tag
    .replace(/^<\/?[a-z][a-z0-9:-]*/i, "")
    .replace(/\/?>\s*$/, "");
  const attributePattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of body.matchAll(attributePattern)) {
    result.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return result;
}

function tagsWithAttributes(html, tagName) {
  return tags(html, tagName).map((tag) => ({ tag, attributes: attributes(tag) }));
}

function metaValues(html, key, value) {
  return tagsWithAttributes(html, "meta")
    .filter(({ attributes: attrs }) => attrs.get(key)?.toLowerCase() === value.toLowerCase())
    .map(({ attributes: attrs }) => attrs.get("content") ?? "");
}

function canonicalValues(html) {
  return tagsWithAttributes(html, "link")
    .filter(({ attributes: attrs }) => (attrs.get("rel") ?? "")
      .toLowerCase()
      .split(/\s+/)
      .includes("canonical"))
    .map(({ attributes: attrs }) => attrs.get("href") ?? "");
}

function titleValues(html) {
  return [...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)]
    .map((match) => match[1].replace(/\s+/g, " ").trim());
}

function normalizedVisibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&middot;|&#183;/gi, "·")
    .replace(/\s+/g, " ")
    .trim();
}

async function readOutput(relativePath) {
  return readFile(path.join(publicOutput, relativePath), "utf8");
}

async function loadHtmlPages() {
  return new Map(await Promise.all(allHtmlFiles.map(async (file) => [file, await readOutput(file)])));
}

function sitemapLocations(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => match[1].trim());
}

function localOutputForRoute(pathname) {
  if (pathname === "/") return "index.html";
  const route = decodeURIComponent(pathname).replace(/^\/+|\/+$/g, "");
  assert.ok(route, `Sitemap route cannot map to an empty output: ${pathname}`);
  assert.doesNotMatch(route, /(?:^|\/)\.\.(?:\/|$)/, `Unsafe sitemap route: ${pathname}`);
  return `${route}.html`;
}

function assertExactKeys(object, allowedKeys, label) {
  assert.deepEqual(Object.keys(object).sort(), [...allowedKeys].sort(), `${label} contains an unapproved or missing field`);
}

test("public HTML has one complete, unique metadata set and the 404 stays out of the index", async () => {
  const pages = await loadHtmlPages();
  const titles = [];
  const descriptions = [];

  for (const [file, html] of pages) {
    const htmlTags = tagsWithAttributes(html, "html");
    const pageTitles = titleValues(html);
    const pageDescriptions = metaValues(html, "name", "description");
    const h1s = [...html.matchAll(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi)];

    assert.equal(htmlTags.length, 1, `${file} must have exactly one html root`);
    assert.equal(htmlTags[0].attributes.get("lang"), "ko", `${file} must declare Korean`);
    assert.equal(pageTitles.length, 1, `${file} must have exactly one title`);
    assert.ok(pageTitles[0], `${file} title must not be empty`);
    assert.equal(pageDescriptions.length, 1, `${file} must have exactly one meta description`);
    assert.ok(pageDescriptions[0].trim(), `${file} description must not be empty`);
    assert.equal(h1s.length, 1, `${file} must expose exactly one static H1`);
    titles.push(pageTitles[0]);
    descriptions.push(pageDescriptions[0].trim());
  }

  assert.equal(new Set(titles).size, titles.length, "Every HTML document needs a unique title");
  assert.equal(new Set(descriptions).size, descriptions.length, "Every HTML document needs a unique description");

  for (const { file, pathname } of publicPages) {
    const html = pages.get(file);
    const canonicals = canonicalValues(html);
    assert.equal(canonicals.length, 1, `${file} must have exactly one canonical`);
    const canonical = new URL(canonicals[0]);
    assert.equal(canonical.origin, expectedOrigin);
    assert.equal(canonical.pathname, pathname);
    assert.equal(canonical.search, "");
    assert.equal(canonical.hash, "");
    assert.equal(metaValues(html, "name", "robots").filter((value) => /\bnoindex\b/i.test(value)).length, 0);
  }

  const notFound = pages.get("404.html");
  assert.equal(canonicalValues(notFound).length, 0, "404 must not declare a canonical URL");
  const notFoundRobots = metaValues(notFound, "name", "robots");
  assert.equal(notFoundRobots.length, 1, "404 must have one robots directive");
  assert.match(notFoundRobots[0], /(?:^|\s|,)noindex(?:\s|,|$)/i);
});

test("canonical, Open Graph, robots and sitemap all use the configured public origin", async () => {
  const robots = await readOutput("robots.txt");
  const sitemap = await readOutput("sitemap.xml");
  const robotsSitemaps = [...robots.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim)].map((match) => match[1]);

  assert.equal(robotsSitemaps.length, 1, "robots.txt must advertise exactly one sitemap");
  const robotsSitemapUrl = new URL(robotsSitemaps[0]);
  assert.equal(robotsSitemapUrl.origin, expectedOrigin);
  assert.equal(robotsSitemapUrl.pathname, "/sitemap.xml");
  assert.match(robots, /^\s*User-agent:\s*\*\s*$/im);
  assert.match(robots, /^\s*Allow:\s*\/\s*$/im);

  const locations = sitemapLocations(sitemap);
  assert.deepEqual(locations.map((location) => new URL(location).pathname).sort(), ["/", "/privacy"]);

  const canonicalByPath = new Map();
  for (const { file, pathname } of publicPages) {
    const html = await readOutput(file);
    const canonical = canonicalValues(html)[0];
    canonicalByPath.set(pathname, canonical);
    assert.equal(metaValues(html, "property", "og:url").length, 1);
    assert.equal(metaValues(html, "property", "og:url")[0], canonical);

    for (const [key, value] of [["property", "og:image"], ["name", "twitter:image"]]) {
      const images = metaValues(html, key, value);
      assert.equal(images.length, 1, `${file} must have one ${value}`);
      const imageUrl = new URL(images[0]);
      assert.equal(imageUrl.origin, expectedOrigin);
      assert.equal(imageUrl.pathname, "/og.png");
    }
  }

  for (const location of locations) {
    const url = new URL(location);
    assert.equal(url.origin, expectedOrigin, `Unexpected sitemap origin: ${location}`);
    assert.equal(url.search, "", `Sitemap URL must not contain a query: ${location}`);
    assert.equal(url.hash, "", `Sitemap URL must not contain a fragment: ${location}`);
    assert.equal(location, canonicalByPath.get(url.pathname), `Sitemap and canonical differ for ${url.pathname}`);
  }
});

test("every sitemap route maps to a local public 200 output and excludes internal surfaces", async () => {
  const sitemap = await readOutput("sitemap.xml");
  const locations = sitemapLocations(sitemap);
  const forbiddenPath = /^\/(?:admin|api|ops-web|internal)(?:\/|$)/i;

  assert.ok(locations.length > 0, "Sitemap must contain at least one public page");
  assert.doesNotMatch(sitemap, /(?:https?:\/\/[^<\s]*\.workers\.dev\b|\/(?:admin|api|ops-web|internal)(?:\/|<))/i);

  for (const location of locations) {
    const url = new URL(location);
    assert.doesNotMatch(url.hostname, /\.workers\.dev$/i, `Internal Worker URL leaked into sitemap: ${location}`);
    assert.doesNotMatch(url.pathname, forbiddenPath, `Internal route leaked into sitemap: ${location}`);
    const output = localOutputForRoute(url.pathname);
    assert.notEqual(output, "404.html");
    await access(path.join(publicOutput, output));
    const html = await readOutput(output);
    assert.match(html, /^<!doctype html>/i, `${url.pathname} does not map to an HTML 200 output`);
    assert.doesNotMatch(metaValues(html, "name", "robots").join(","), /\bnoindex\b/i);
  }
});

test("clean public routes have permanent redirects from their .html aliases", async () => {
  const redirects = await readOutput("_redirects");
  const rules = redirects
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/));

  assert.deepEqual(rules, [["/index.html", "/", "301"], ["/privacy.html", "/privacy", "301"]]);
  const bySource = new Map(rules.map(([source, destination, status]) => [source, { destination, status }]));
  assert.deepEqual(bySource.get("/index.html"), { destination: "/", status: "301" });
  assert.deepEqual(bySource.get("/privacy.html"), { destination: "/privacy", status: "301" });
});

test("PUBLIC_SITE_URL accepts only a public HTTPS origin", () => {
  assert.equal(resolvePublicSiteUrl("https://public.example.kr"), "https://public.example.kr");
  assert.equal(resolvePublicSiteUrl("https://PUBLIC.example.kr:443/"), "https://public.example.kr");

  const rejected = [
    "",
    "   ",
    "http://public.example.kr",
    "ftp://public.example.kr",
    "https://public.example.kr/site",
    "https://public.example.kr?source=qa",
    "https://public.example.kr#seo",
    "https://user:password@public.example.kr",
    "https://localhost",
    "https://preview.localhost",
    "https://internal.local",
    "https://intranet",
    "https://127.0.0.1",
    "https://10.0.0.1",
    "https://169.254.1.1",
    "https://192.168.1.1",
    "https://[::1]",
    "https://harmony-ops.workers.dev",
    "https://harmony-ops.workers.dev.",
    "https://workers.dev.",
    "https://workers.dev"
  ];
  for (const value of rejected) {
    assert.throws(() => resolvePublicSiteUrl(value), Error, `PUBLIC_SITE_URL should reject ${JSON.stringify(value)}`);
  }
});

test("custom origin is rendered end-to-end and the build rejects unregistered public routes", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "harmony-public-seo-"));
  const outputDir = path.join(temporaryRoot, "public-site");
  const customOrigin = "https://seo.example.test";

  try {
    await cp(publicSource, outputDir, { recursive: true });
    await finalizePublicSeo({ outputDir, siteUrl: customOrigin });

    const rendered = await Promise.all([
      readFile(path.join(outputDir, "index.html"), "utf8"),
      readFile(path.join(outputDir, "privacy.html"), "utf8"),
      readFile(path.join(outputDir, "robots.txt"), "utf8"),
      readFile(path.join(outputDir, "sitemap.xml"), "utf8")
    ]);
    assert.ok(rendered.every((source) => source.includes(customOrigin)));
    assert.ok(rendered.every((source) => !source.includes("https://harmony-work.pages.dev")));

    const unexpectedHtml = path.join(outputDir, "admin.html");
    await writeFile(unexpectedHtml, "<!doctype html><title>internal</title>", "utf8");
    await assert.rejects(
      validatePublicSeoBuild({ outputDir, siteUrl: customOrigin }),
      /unregistered HTML documents/
    );
    await rm(unexpectedHtml);

    const redirectsPath = path.join(outputDir, "_redirects");
    const redirects = await readFile(redirectsPath, "utf8");
    await writeFile(redirectsPath, `${redirects}/* / 301\n`, "utf8");
    await assert.rejects(
      validatePublicSeoBuild({ outputDir, siteUrl: customOrigin }),
      /only the two canonical HTML alias redirects/
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("JSON-LD exposes only the explicitly approved LocalBusiness identity fields", async () => {
  const pages = await loadHtmlPages();
  const blocks = [];

  for (const [file, html] of pages) {
    assert.doesNotMatch(html, /\b(?:EmploymentAgency|JobPosting)\b/, `${file} contains a disallowed schema type`);
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      const attrs = attributes(`<script ${match[1]}>`);
      if ((attrs.get("type") ?? "").toLowerCase() === "application/ld+json") {
        blocks.push({ file, value: JSON.parse(match[2]) });
      }
    }
  }

  assert.equal(blocks.length, 1, "The public site must have exactly one JSON-LD identity block");
  assert.equal(blocks[0].file, "index.html");
  const business = blocks[0].value;
  assertExactKeys(
    business,
    ["@context", "@type", "address", "areaServed", "image", "name", "telephone", "url"],
    "LocalBusiness"
  );
  assert.equal(business["@context"], "https://schema.org");
  assert.equal(business["@type"], "LocalBusiness");
  assert.equal(business.name, "하모니직업소개소");
  assert.equal(business.telephone, "+82-10-9124-2537");
  assert.equal(new URL(business.url).origin, expectedOrigin);
  assert.equal(new URL(business.url).pathname, "/");
  assert.equal(new URL(business.image).origin, expectedOrigin);
  assert.equal(new URL(business.image).pathname, "/assets/harmony-office.png");
  assertExactKeys(
    business.address,
    ["@type", "addressCountry", "addressRegion", "addressLocality", "streetAddress"],
    "PostalAddress"
  );
  assert.equal(business.address["@type"], "PostalAddress");
  assert.equal(business.address.addressCountry, "KR");
  assert.equal(business.address.addressRegion, "서울특별시");
  assert.equal(business.address.addressLocality, "동작구");
  assert.equal(business.address.streetAddress, "남부순환로 2069");
  assert.deepEqual(business.areaServed, ["서울특별시 동작구", "서울특별시 관악구", "서울특별시 서초구"]);
  assert.doesNotMatch(
    JSON.stringify(business),
    /(?:"(?:openingHours|postalCode)"\s*:|\b(?:EmploymentAgency|JobPosting)\b)/,
    "Unverified hours, postal code, or job schema data must not be published"
  );
});

test("the home page keeps its core service and contact copy in static HTML", async () => {
  const html = await readOutput("index.html");
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  assert.equal(h1s.length, 1);
  const h1Text = normalizedVisibleText(h1s[0][1]);
  assert.match(h1Text, /식당에 필요한 일손/);
  assert.match(h1Text, /일자리를 찾는 분/);

  const visibleText = normalizedVisibleText(html);
  for (const phrase of [
    "사람이 필요한 식당",
    "일자리를 찾는 분",
    "날짜, 시간, 하는 일, 임금",
    "전화·방문 상담",
    "010-9124-2537"
  ]) {
    assert.ok(visibleText.includes(phrase), `Missing static public copy: ${phrase}`);
  }
  assert.doesNotMatch(visibleText, /2015년|사당동 1044-13|07025|2015년 1월 28일/);
  assert.match(html, /<a\b[^>]*href="tel:01091242537"/i);
});

test("images have dimensions and accessible alternatives, while below-fold media is lazy", async () => {
  const pages = await loadHtmlPages();
  let imageCount = 0;

  for (const [file, html] of pages) {
    for (const { tag, attributes: attrs } of tagsWithAttributes(html, "img")) {
      imageCount += 1;
      assert.ok(attrs.has("alt"), `${file} image is missing alt: ${tag}`);
      assert.match(attrs.get("width") ?? "", /^[1-9]\d*$/, `${file} image needs a numeric width: ${tag}`);
      assert.match(attrs.get("height") ?? "", /^[1-9]\d*$/, `${file} image needs a numeric height: ${tag}`);
    }
  }
  assert.ok(imageCount > 0);

  const home = pages.get("index.html");
  const heroStart = home.search(/<section\b[^>]*\bid="top"/i);
  const heroEnd = home.indexOf("</section>", heroStart);
  assert.ok(heroStart >= 0 && heroEnd > heroStart, "Home page hero section is missing");
  const belowFoldImages = tagsWithAttributes(home.slice(heroEnd + "</section>".length), "img");
  assert.ok(belowFoldImages.length > 0, "Expected at least one below-fold image");
  for (const { tag, attributes: attrs } of belowFoldImages) {
    assert.equal(attrs.get("loading"), "lazy", `Below-fold image must load lazily: ${tag}`);
  }
});

test("Open Graph image is a bounded 1200 by 630 PNG", async () => {
  const imagePath = path.join(publicOutput, "og.png");
  const [image, imageStat] = await Promise.all([readFile(imagePath), stat(imagePath)]);

  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
  assert.ok(imageStat.size <= 2 * 1024 * 1024, `og.png exceeds the 2 MiB budget (${imageStat.size} bytes)`);

  for (const { file } of publicPages) {
    const html = await readOutput(file);
    assert.deepEqual(metaValues(html, "property", "og:image:width"), ["1200"]);
    assert.deepEqual(metaValues(html, "property", "og:image:height"), ["630"]);
    assert.deepEqual(metaValues(html, "property", "og:image:type"), ["image/png"]);
  }
});

test("public assets do not load external analytics", async () => {
  const pages = await loadHtmlPages();
  const app = await readOutput("app.js");
  const auditedContent = [...pages.values(), app].join("\n");
  const analyticsSignatures = /(?:googletagmanager\.com|google-analytics\.com|static\.cloudflareinsights\.com|cloudflareinsights\.com|\/cdn-cgi\/rum|connect\.facebook\.net|plausible\.io|matomo(?:\.js)?|data-cf-beacon|\bgtag\s*\(|\bga\s*\(\s*["']create["'])/i;

  assert.doesNotMatch(auditedContent, analyticsSignatures);
  for (const [file, html] of pages) {
    for (const { tag, attributes: attrs } of tagsWithAttributes(html, "script")) {
      if (!attrs.has("src")) continue;
      const source = attrs.get("src");
      assert.match(source, /^\/(?!\/)/, `${file} loads a non-local script: ${tag}`);
    }
  }
});

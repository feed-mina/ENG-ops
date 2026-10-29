import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function fetchBuilt(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("cache", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`https://example.test${path}`));
}

test("공개 홈페이지와 보안 헤더를 빌드한다", async () => {
  const response = await fetchBuilt("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html/);
  assert.match(response.headers.get("content-security-policy") ?? "", /form-action 'none'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  const html = await response.text();
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  assert.match(html, /하모니직업소개소/);
  assert.match(html, /MOCK PROTOTYPE/);
  assert.doesNotMatch(html, /<form\b/i);
});

test("내부 업무 기능과 사용자 승인 연락처·현장 실사 Mock이 포함된다", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  for (const label of ["식당 구인", "근로자", "매칭·배정", "요금·장부", "준법 캘린더", "현장 실사", "Mock 문서함", "AI 실증", "감사기록"]) {
    assert.match(app, new RegExp(label));
  }
  assert.match(app, /0003\.png 공개/);
  assert.match(app, /tel:01091242537/);
  assert.doesNotMatch(app, /전화 상담 준비 중/);
  assert.match(app, /인증 비활성/);
});

test("모든 Mock 문서는 표시와 경고를 가진다", async () => {
  const directory = new URL("../mock-documents/", import.meta.url);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".json"));
  assert.ok(files.length >= 13);
  for (const file of files) {
    const document = JSON.parse(await readFile(new URL(file, directory), "utf8"));
    assert.equal(document.mock, true);
    assert.match(document.warning, /(실제|제출|증명)/);
  }

  const fieldAudit = JSON.parse(await readFile(new URL("mock-field-audit-report.json", directory), "utf8"));
  assert.equal(fieldAudit.confirmedForPrototype.find((item) => item.field === "0003.png 공개")?.value, "승인");
  assert.ok(fieldAudit.evidenceStatus.some((item) => item.item === "사업자등록증" && item.status === "mock-ready"));
  assert.ok(fieldAudit.unresolvedQuestions.length >= 5);

  const workflows = JSON.parse(await readFile(new URL("mock-workflow-scenarios.json", directory), "utf8"));
  assert.deepEqual(workflows.scenarios.map((scenario) => scenario.type), ["one-day", "one-month", "daily-member"]);
  assert.ok(workflows.scenarios.every((scenario) => scenario.steps.length === 7));
});

test("없는 경로는 404를 반환한다", async () => {
  const response = await fetchBuilt("/private-records");
  assert.equal(response.status, 404);
});

test("Cloudflare Pages용 홍보 사이트를 별도 산출물로 빌드한다", async () => {
  const site = new URL("../dist/public-site/", import.meta.url);
  const html = await readFile(new URL("index.html", site), "utf8");
  const privacyHtml = await readFile(new URL("privacy.html", site), "utf8");
  const notFoundHtml = await readFile(new URL("404.html", site), "utf8");
  const publicApp = await readFile(new URL("app.js", site), "utf8");
  const headers = await readFile(new URL("_headers", site), "utf8");
  const redirects = await readFile(new URL("_redirects", site), "utf8");
  const robots = await readFile(new URL("robots.txt", site), "utf8");
  const sitemap = await readFile(new URL("sitemap.xml", site), "utf8");
  assert.match(html, /식당에 필요한 일손/);
  assert.match(html, /식당에 꼭 확인할 내용/);
  assert.match(html, /일하실 분에게 꼭 확인할 내용/);
  assert.match(html, /이 홈페이지에서는 개인정보를 받지 않습니다/);
  assert.doesNotMatch(html, /Harmony service|Simple process|Before calling|Care &amp; trust|Visit harmony/);
  assert.match(html, /rel="icon" href="\/favicon\.svg"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/harmony-work\.pages\.dev\/" \/>/);
  assert.match(privacyHtml, /<link rel="canonical" href="https:\/\/harmony-work\.pages\.dev\/privacy" \/>/);
  assert.match(html, /<meta property="og:url" content="https:\/\/harmony-work\.pages\.dev\/" \/>/);
  assert.match(privacyHtml, /<meta property="og:url" content="https:\/\/harmony-work\.pages\.dev\/privacy" \/>/);
  for (const page of [html, privacyHtml]) {
    assert.match(page, /<meta property="og:locale" content="ko_KR" \/>/);
    assert.match(page, /<meta property="og:site_name" content="하모니직업소개소" \/>/);
    assert.match(page, /<meta property="og:image" content="https:\/\/harmony-work\.pages\.dev\/og\.png" \/>/);
    assert.match(page, /<meta property="og:image:width" content="1200" \/>/);
    assert.match(page, /<meta property="og:image:height" content="630" \/>/);
    assert.match(page, /<meta property="og:image:alt" content="하모니직업소개소 사당동 식당 인력소개 안내" \/>/);
    assert.match(page, /<meta name="twitter:card" content="summary_large_image" \/>/);
    assert.match(page, /<meta name="twitter:image" content="https:\/\/harmony-work\.pages\.dev\/og\.png" \/>/);
    assert.match(page, /<meta name="twitter:image:alt" content="하모니직업소개소 사당동 식당 인력소개 안내" \/>/);
  }
  assert.equal(html.match(/href="\/privacy"/g)?.length, 2);
  assert.doesNotMatch(html, /href="\/privacy\.html"/);
  const structuredDataMatch = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(structuredDataMatch);
  const structuredData = JSON.parse(structuredDataMatch[1]);
  assert.deepEqual(structuredData, {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "하모니직업소개소",
    url: "https://harmony-work.pages.dev/",
    telephone: "+82-10-9124-2537",
    image: "https://harmony-work.pages.dev/assets/harmony-office.png",
    address: {
      "@type": "PostalAddress",
      addressCountry: "KR",
      addressRegion: "서울특별시",
      addressLocality: "동작구",
      streetAddress: "남부순환로 2069"
    },
    areaServed: ["서울특별시 동작구", "서울특별시 관악구", "서울특별시 서초구"]
  });
  assert.match(html, /src="\/assets\/harmony-mark\.svg"/);
  assert.doesNotMatch(html, /<form\b/i);
  assert.match(html, /href="tel:01091242537"/);
  assert.match(html, /010-9124-2537/);
  assert.doesNotMatch(html, /전화번호 확인 중|지금은 홈페이지 접수를 받지 않습니다/);
  assert.doesNotMatch(html, /근로계약과 일할 곳의 업무 안내, 임금 지급은 채용한 식당에서 직접 합니다/);
  assert.match(html, /data-tab-link="worker-info"/);
  assert.match(publicApp, /showLinkedPanel/);
  assert.match(publicApp, /scrollIntoView/);
  assert.match(html, /<iframe[^>]+maps\.google\.com\/maps/);
  assert.match(html, /src="\/assets\/harmony-exterior\.png"/);
  assert.match(html, /src="\/assets\/harmony-contact-card\.png"/);
  assert.match(html, /src="\/assets\/harmony-wordmark\.png"/);
  assert.match(html, /src="\/assets\/harmony-award\.png"/);
  assert.match(html, /class="story-media story-media-contact"/);
  assert.match(html, /class="location-overview"/);
  assert.match(html, /class="map-block"/);
  assert.doesNotMatch(html, /map-placeholder/);
  assert.match(privacyHtml, /개인정보 보호법/);
  assert.match(privacyHtml, /직업안정법 시행규칙/);
  assert.match(privacyHtml, /국가법령정보센터|law\.go\.kr/);
  assert.doesNotMatch(privacyHtml, /나중에 홈페이지 접수를 시작하기 전에|주민등록번호|2\. 동의를 따로 받습니다|4\. 누가 보고 고쳤는지|지금 홈페이지에서는/);
  assert.match(headers, /form-action 'none'/);
  assert.match(headers, /frame-src https:\/\/www\.google\.com https:\/\/maps\.google\.com/);
  assert.match(redirects, /^\/index\.html \/ 301$/m);
  assert.match(redirects, /^\/privacy\.html \/privacy 301$/m);
  assert.doesNotMatch(html, /\b(?:noindex|nofollow)\b/i);
  assert.doesNotMatch(headers, /\b(?:noindex|nofollow)\b/i);
  assert.match(notFoundHtml, /<meta name="robots" content="noindex, follow" \/>/);
  assert.match(notFoundHtml, /페이지를 찾을 수 없습니다/);
  assert.doesNotMatch(notFoundHtml, /rel="canonical"/);
  assert.match(robots, /^Sitemap: https:\/\/harmony-work\.pages\.dev\/sitemap\.xml$/m);
  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(sitemap, /<loc>https:\/\/harmony-work\.pages\.dev\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/harmony-work\.pages\.dev\/privacy<\/loc>/);
  await access(new URL("assets/harmony-office.png", site));
  await access(new URL("assets/harmony-exterior.png", site));
  await access(new URL("assets/harmony-contact-card.png", site));
  await access(new URL("assets/harmony-wordmark.png", site));
  await access(new URL("assets/harmony-award.png", site));
  await access(new URL("assets/harmony-mark.svg", site));
  await access(new URL("assets/harmony-logo.svg", site));
  await access(new URL("favicon.svg", site));
  const socialImage = await readFile(new URL("og.png", site));
  assert.equal(socialImage.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(socialImage.readUInt32BE(16), 1200);
  assert.equal(socialImage.readUInt32BE(20), 630);
  const manifest = JSON.parse(await readFile(new URL("site.webmanifest", site), "utf8"));
  assert.equal(manifest.name, "하모니직업소개소");
  assert.equal(manifest.icons[0].src, "/favicon.svg");
});

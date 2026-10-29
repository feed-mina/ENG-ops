import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const READY_TIMEOUT_MS = 10_000;
const STOP_TIMEOUT_MS = 2_000;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const reservation = createServer();

    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", () => {
      const address = reservation.address();
      if (!address || typeof address === "string") {
        reservation.close();
        reject(new Error("Failed to reserve a local TCP port"));
        return;
      }

      reservation.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

function waitForReady(child, expectedOutput) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("error", onError);
      child.off("exit", onExit);
      if (error) reject(error);
      else resolve();
    };

    const diagnostic = () => [
      stdout && `stdout:\n${stdout.trim()}`,
      stderr && `stderr:\n${stderr.trim()}`
    ].filter(Boolean).join("\n");

    const onStdout = (chunk) => {
      stdout += chunk;
      if (stdout.includes(expectedOutput)) finish();
    };
    const onStderr = (chunk) => {
      stderr += chunk;
    };
    const onError = (error) => finish(error);
    const onExit = (code, signal) => finish(new Error(
      `Development server exited before it was ready (code=${code}, signal=${signal}).\n${diagnostic()}`
    ));

    const timeout = setTimeout(() => finish(new Error(
      `Timed out waiting for development server output: ${expectedOutput}\n${diagnostic()}`
    )), READY_TIMEOUT_MS);

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;

  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, delay(STOP_TIMEOUT_MS)]);

  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([exited, delay(STOP_TIMEOUT_MS)]);
  }
}

async function startDevelopmentServer(t, scriptPath, readyLabel) {
  const port = await findFreePort();
  const child = spawn(process.execPath, [path.join(root, scriptPath), String(port)], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  t.after(() => stopChild(child));
  await waitForReady(child, `${readyLabel}: http://127.0.0.1:${port}`);
  return `http://127.0.0.1:${port}`;
}

async function fetchText(baseUrl, pathname, options) {
  const response = await fetch(new URL(pathname, baseUrl), options);
  return { response, body: await response.text() };
}

test("internal development server serves both canonical admin paths", async (t) => {
  const baseUrl = await startDevelopmentServer(t, "scripts/dev.mjs", "Local");
  const canonical = await fetchText(baseUrl, "/admin");
  const trailingSlash = await fetchText(baseUrl, "/admin/");

  assert.equal(canonical.response.status, 200);
  assert.match(canonical.response.headers.get("content-type") ?? "", /^text\/html\b/);
  assert.match(canonical.body, /<title>[^<]*하모니직업소개소[^<]*<\/title>/);

  assert.equal(trailingSlash.response.status, 200);
  assert.match(trailingSlash.response.headers.get("content-type") ?? "", /^text\/html\b/);
  assert.equal(trailingSlash.body, canonical.body);
});

test("built Worker serves both canonical admin paths", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("routing-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const canonical = await worker.fetch(new Request("https://example.test/admin"));
  const trailingSlash = await worker.fetch(new Request("https://example.test/admin/"));

  assert.equal(canonical.status, 200);
  assert.match(canonical.headers.get("content-type") ?? "", /^text\/html\b/);
  assert.equal(trailingSlash.status, 200);
  assert.match(trailingSlash.headers.get("content-type") ?? "", /^text\/html\b/);
  assert.equal(await trailingSlash.text(), await canonical.text());
});

test("built Worker serves the private ops-web route without exposing it from the public site", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("ops-web-routing-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const canonical = await worker.fetch(new Request("https://example.test/ops-web/"));
  const explicit = await worker.fetch(new Request("https://example.test/ops-web/index.html"));

  assert.equal(canonical.status, 200);
  assert.match(canonical.headers.get("content-type") ?? "", /^text\/html\b/);
  const canonicalHtml = await canonical.text();
  assert.match(canonicalHtml, /id="ops-web-root"/);
  assert.match(canonicalHtml, /href="\.\/renderer\.css"/);
  assert.match(canonicalHtml, /href="\.\/styles\.css"/);
  assert.match(canonicalHtml, /src="\.\/app\.js"/);
  assert.equal(explicit.status, 200);
  assert.match(await explicit.text(), /id="ops-web-root"/);

  for (const [pathname, contentType, expectedText] of [
    ["/ops-web/renderer.css", /^text\/css\b/, ".sdui-root"],
    ["/ops-web/styles.css", /^text\/css\b/, ".consultation-page"],
    ["/ops-web/app.js", /^text\/javascript\b/, "bootstrapOpsWeb"]
  ]) {
    const asset = await worker.fetch(new Request(`https://example.test${pathname}`));
    assert.equal(asset.status, 200, pathname);
    assert.match(asset.headers.get("content-type") ?? "", contentType, pathname);
    assert.match(await asset.text(), new RegExp(expectedText.replace(".", "\\.")), pathname);
  }

  const opsHtml = await worker.fetch(new Request("https://example.test/ops-web/"));
  assert.equal(opsHtml.headers.get("cache-control"), "no-store");
  assert.match(opsHtml.headers.get("content-security-policy") ?? "", /media-src 'self' blob:/);
  assert.equal(opsHtml.headers.get("permissions-policy"), "camera=(), microphone=(self), geolocation=()");

  const forwarded = [];
  const apiResponse = await worker.fetch(
    new Request("https://example.test/api/session", {
      headers: { "Cf-Access-Jwt-Assertion": "test-token" }
    }),
    {
      OPS_API: {
        async fetch(request) {
          forwarded.push(request);
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json; charset=utf-8" }
          });
        }
      }
    }
  );
  assert.equal(apiResponse.status, 200);
  assert.equal(forwarded.length, 1);
  assert.equal(forwarded[0].url, "https://example.test/api/session");
  assert.equal(forwarded[0].headers.get("Cf-Access-Jwt-Assertion"), "test-token");
});

test("public development server matches deployed clean URLs and branded 404 behavior", async (t) => {
  const baseUrl = await startDevelopmentServer(t, "scripts/dev-public.mjs", "Harmony public");

  const home = await fetchText(baseUrl, "/");
  assert.equal(home.response.status, 200);
  assert.match(home.response.headers.get("content-type") ?? "", /^text\/html\b/);
  assert.match(home.body, /<title>하모니직업소개소 \| 동작구 사당동 식당 인력소개<\/title>/);

  const indexHtml = await fetchText(baseUrl, "/index.html", { redirect: "manual" });
  assert.equal(indexHtml.response.status, 301);
  assert.equal(indexHtml.response.headers.get("location"), "/");

  const privacyHtml = await fetchText(baseUrl, "/privacy.html", { redirect: "manual" });
  const privacyClean = await fetchText(baseUrl, "/privacy");
  assert.equal(privacyHtml.response.status, 301);
  assert.equal(privacyHtml.response.headers.get("location"), "/privacy");
  assert.equal(privacyClean.response.status, 200);
  assert.match(privacyClean.response.headers.get("content-type") ?? "", /^text\/html\b/);
  assert.match(privacyClean.body, /<title>개인정보 안내 \| 하모니직업소개소<\/title>/);

  const robots = await fetchText(baseUrl, "/robots.txt");
  assert.equal(robots.response.status, 200);
  assert.match(robots.response.headers.get("content-type") ?? "", /^text\/plain\b/);
  assert.match(robots.body, /Sitemap: https:\/\/harmony-work\.pages\.dev\/sitemap\.xml/);

  const sitemap = await fetchText(baseUrl, "/sitemap.xml");
  assert.equal(sitemap.response.status, 200);
  assert.match(sitemap.response.headers.get("content-type") ?? "", /^application\/xml\b/);
  assert.match(sitemap.body, /<loc>https:\/\/harmony-work\.pages\.dev\/<\/loc>/);
  assert.match(sitemap.body, /<loc>https:\/\/harmony-work\.pages\.dev\/privacy<\/loc>/);

  const og = await fetch(new URL("/og.png", baseUrl));
  const ogBytes = new Uint8Array(await og.arrayBuffer());
  assert.equal(og.status, 200);
  assert.match(og.headers.get("content-type") ?? "", /^image\/png\b/);
  assert.deepEqual([...ogBytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

  const missing = await fetchText(baseUrl, "/this-page-does-not-exist");
  assert.equal(missing.response.status, 404);
  assert.match(missing.response.headers.get("content-type") ?? "", /^text\/html\b/);
  assert.match(missing.body, /<meta name="robots" content="noindex, follow" \/>/);
  assert.match(missing.body, /<title>페이지를 찾을 수 없습니다 \| 하모니직업소개소<\/title>/);
  assert.match(missing.body, /<p class="eyebrow">404<\/p>/);
});

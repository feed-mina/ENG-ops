import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getSduiPage, getSduiResource } from "../apps/ops-app/src/sdui.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.join(root, "dist", "ops-web");
const port = Number(process.argv[2] || process.env.PORT || 4175);
const principal = Object.freeze({ id: "LOCAL-MOCK-OWNER", role: "owner", active: true });
const env = Object.freeze({ DATA_MODE: "mock", SDUI_ENABLED: "true", SDUI_REVISION: "1" });
const staticFiles = Object.freeze({
  "/": Object.freeze({ file: "index.html", type: "text/html; charset=utf-8" }),
  "/index.html": Object.freeze({ file: "index.html", type: "text/html; charset=utf-8" }),
  "/app.js": Object.freeze({ file: "app.js", type: "text/javascript; charset=utf-8" }),
  "/styles.css": Object.freeze({ file: "styles.css", type: "text/css; charset=utf-8" }),
  "/renderer.css": Object.freeze({ file: "renderer.css", type: "text/css; charset=utf-8" })
});
const securityHeaders = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; media-src 'self' blob:; font-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow",
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=()"
});

function writeJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    ...securityHeaders,
    ...headers,
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

async function writeSduiResult(response, result) {
  if (result.notModified) {
    response.writeHead(304, { ...securityHeaders, ...result.headers }).end();
    return;
  }
  writeJson(response, 200, result.body, result.headers);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    if (request.method !== "GET" && request.method !== "HEAD") {
      writeJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED" }, { Allow: "GET, HEAD" });
      return;
    }

    if (url.pathname === "/api/session" && request.method === "GET") {
      writeJson(response, 200, { ok: true, principal: { id: principal.id, role: principal.role }, dataMode: env.DATA_MODE });
      return;
    }
    if (url.pathname === "/api/ui/pages/dashboard" && request.method === "GET") {
      await writeSduiResult(response, await getSduiPage({
        pageId: "dashboard",
        url,
        env,
        principal,
        ifNoneMatch: request.headers["if-none-match"]
      }));
      return;
    }
    if (url.pathname === "/api/ui/data/dashboard.summary" && request.method === "GET") {
      await writeSduiResult(response, await getSduiResource({
        resourceId: "dashboard.summary",
        url,
        env,
        principal,
        ifNoneMatch: request.headers["if-none-match"]
      }));
      return;
    }

    const asset = staticFiles[url.pathname];
    if (!asset) {
      writeJson(response, 404, { ok: false, code: "NOT_FOUND" });
      return;
    }
    const body = await readFile(path.join(siteDir, asset.file));
    response.writeHead(200, { ...securityHeaders, "Content-Type": asset.type });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    writeJson(response, Number(error?.status) || 500, {
      ok: false,
      code: typeof error?.code === "string" ? error.code : "LOCAL_PREVIEW_ERROR"
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Harmony ops-web local synthetic preview: http://127.0.0.1:${port}`);
  console.log("LOCAL MOCK ONLY: Cloudflare Access is not active and no real data is loaded.");
});

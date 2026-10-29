import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const mockDir = path.join(root, "mock-documents");
const distDir = path.join(root, "dist");
const preserveDist = process.argv.includes("--preserve");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

async function collect(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const assets = {};
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      Object.assign(assets, await collect(absolute, relative));
      continue;
    }
    const body = await readFile(absolute, "utf8");
    assets[`/${relative}`] = {
      body,
      type: mimeTypes[path.extname(entry.name)] ?? "application/octet-stream"
    };
  }
  return assets;
}

if (!preserveDist) await rm(distDir, { recursive: true, force: true });
await mkdir(path.join(distDir, "server"), { recursive: true });
await mkdir(path.join(distDir, "static"), { recursive: true });

const assets = {
  ...(await collect(publicDir)),
  ...(await collect(mockDir, "mock-documents")),
  ...(preserveDist ? await collect(path.join(distDir, "ops-web"), "ops-web") : {})
};

for (const [urlPath, asset] of Object.entries(assets)) {
  const outputPath = path.join(distDir, "static", urlPath.slice(1));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, asset.body, "utf8");
}

const workerSource = `const assets = ${JSON.stringify(assets)};
const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};
const opsWebSecurityHeaders = {
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; media-src 'self' blob:; font-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=()"
};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      if (!env?.OPS_API?.fetch) {
        return new Response(JSON.stringify({ ok: false, code: "OPS_API_UNAVAILABLE" }), {
          status: 503,
          headers: { ...opsWebSecurityHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
        });
      }
      return await env.OPS_API.fetch(request);
    }
    const requestedPath = url.pathname === "/" || url.pathname === "/admin" || url.pathname === "/admin/"
      ? "/index.html"
      : url.pathname === "/ops-web" || url.pathname === "/ops-web/"
        ? "/ops-web/index.html"
        : url.pathname;
    const asset = assets[requestedPath];
    if (!asset) return new Response("Not found", { status: 404, headers: securityHeaders });
    const isOpsWebAsset = requestedPath.startsWith("/ops-web/");
    const responseSecurityHeaders = isOpsWebAsset ? opsWebSecurityHeaders : securityHeaders;
    return new Response(asset.body, { headers: { ...responseSecurityHeaders, "Content-Type": asset.type, "Cache-Control": requestedPath === "/index.html" || isOpsWebAsset ? "no-store" : "public, max-age=300" } });
  }
};
`;

await writeFile(path.join(distDir, "server", "index.js"), workerSource, "utf8");
console.log(`Built ${Object.keys(assets).length} mock assets into dist/`);

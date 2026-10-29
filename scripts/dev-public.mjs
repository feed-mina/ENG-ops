import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.join(root, "dist", "public-site");
const port = Number(process.argv[2] || process.env.PORT || 4174);
const redirects = new Map((await readFile(path.join(siteDir, "_redirects"), "utf8"))
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [from, to, status] = line.split(/\s+/);
    if (!from?.startsWith("/") || !to?.startsWith("/") || status !== "301") {
      throw new Error(`Invalid local redirect rule: ${line}`);
    }
    return [from, Object.freeze({ to, status: Number(status) })];
  }));
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const redirect = redirects.get(url.pathname);
  if (redirect) {
    response.writeHead(redirect.status, {
      Location: redirect.to,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }).end();
    return;
  }
  const requested = url.pathname === "/"
    ? "index.html"
    : url.pathname === "/privacy"
      ? "privacy.html"
      : url.pathname.slice(1);
  const normalized = path.normalize(requested);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    response.writeHead(400).end("Bad request");
    return;
  }
  try {
    const body = await readFile(path.join(siteDir, normalized));
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(normalized)] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(body);
  } catch {
    try {
      const body = await readFile(path.join(siteDir, "404.html"));
      response.writeHead(404, {
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff"
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  }
});

server.listen(port, "127.0.0.1", () => console.log(`Harmony public: http://127.0.0.1:${port}`));

import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "apps", "ops-web");
const outDir = path.join(root, "dist", "ops-web");
const enabled = process.argv.includes("--enabled");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await Promise.all([
  copyFile(path.join(sourceDir, "index.html"), path.join(outDir, "index.html")),
  copyFile(path.join(sourceDir, "_headers"), path.join(outDir, "_headers")),
  copyFile(path.join(sourceDir, "styles.css"), path.join(outDir, "styles.css")),
  copyFile(path.join(root, "packages", "sdui-renderer-web", "styles.css"), path.join(outDir, "renderer.css")),
  writeFile(path.join(outDir, "build-manifest.json"), `${JSON.stringify({
    schema: "harmony.ops-web.build.v1",
    sduiEnabled: enabled
  }, null, 2)}\n`, "utf8")
]);

await build({
  entryPoints: [path.join(sourceDir, "src", "app.js")],
  outfile: path.join(outDir, "app.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  legalComments: "none",
  sourcemap: false,
  define: {
    __OPS_WEB_SDUI_ENABLED__: JSON.stringify(enabled)
  }
});

console.log(`Built ops-web into dist/ops-web (SDUI ${enabled ? "enabled for local preview" : "off"})`);

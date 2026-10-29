import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { finalizePublicSeo, resolvePublicSiteUrl } from "./public-seo.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "apps", "public-site");
const outputDir = path.join(root, "dist", "public-site");
const siteUrl = resolvePublicSiteUrl();

async function copyDirectory(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name === "README.md") continue;
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyDirectory(sourcePath, destinationPath);
    else await copyFile(sourcePath, destinationPath);
  }
}

await rm(outputDir, { recursive: true, force: true });
await copyDirectory(sourceDir, outputDir);
const seo = await finalizePublicSeo({ outputDir, siteUrl });

console.log(`Built Cloudflare Pages public site into dist/public-site/ (${seo.siteUrl})`);

import { readFile } from "node:fs/promises";

const files = [
  "apps/construction/index.html", "apps/construction/styles.css", "apps/construction/app.js", "apps/construction/worker.js", "packages/construction/conditions.js",
  "public/index.html", "public/styles.css", "public/domain.js", "public/mock-data.js", "public/app.js", "public/excel-export.js",
  "apps/public-site/index.html", "apps/public-site/privacy.html", "apps/public-site/styles.css", "apps/public-site/app.js",
  "apps/public-site/favicon.svg", "apps/public-site/assets/harmony-mark.svg", "apps/public-site/assets/harmony-logo.svg", "apps/public-site/site.webmanifest",
  "apps/public-site/_redirects", "scripts/public-seo.mjs",
  "apps/ops-app/src/index.js", "apps/ops-app/src/access.js", "apps/ops-app/src/rbac.js", "apps/ops-app/src/crypto.js",
  "apps/ops-app/src/audit.js", "apps/ops-app/src/retention.js", "apps/ops-app/src/operations.js", "apps/ops-app/src/sdui.js",
  "packages/contracts/business-evidence.js", "packages/contracts/intake.js", "packages/contracts/operations.js", "packages/contracts/worker-resume.js", "packages/compliance/rules.js", "packages/validation/turnstile.js",
  "packages/consultation-prompts/index.js",
  "packages/sdui-actions/index.js", "packages/sdui-contracts/index.js", "packages/sdui-contracts/template-manifest.js", "packages/sdui-contracts/package-assets.js",
  "packages/sdui-contracts/harmony.sdui.document.v1.schema.json", "packages/sdui-contracts/harmony.sdui.capabilities.v1.schema.json", "packages/sdui-testing/index.js",
  "packages/sdui-renderer-core/index.js", "packages/sdui-renderer-web/index.js", "packages/sdui-renderer-web/styles.css",
  "apps/ops-web/index.html", "apps/ops-web/_headers", "apps/ops-web/styles.css", "apps/ops-web/src/app.js", "apps/ops-web/src/consultation.js",
  "scripts/build-ops-web.mjs", "scripts/dev-ops-web.mjs",
  "sdui/harmony-ops/template.manifest.json", "sdui/harmony-ops/theme/tokens.json", "sdui/harmony-ops/messages/ko.json",
  "sdui/harmony-ops/pages/dashboard.mock.document.json", "sdui/harmony-ops/fixtures/dashboard.mock.data.json"
];
const verifiedPublicPhone = "010-9124-2537";
for (const file of files) {
  const source = await readFile(file, "utf8");
  if (source.includes("codex-preview") || source.includes("react-loading-skeleton")) throw new Error(`${file}: starter marker remains`);
  if (/\b\d{6}-\d{7}\b/.test(source)) throw new Error(`${file}: resident registration number-like value detected`);
  const sourceWithoutVerifiedPhone = source.replaceAll(verifiedPublicPhone, "");
  if (file.startsWith("apps/public-site/") && /010-\d{3,4}-\d{4}/.test(sourceWithoutVerifiedPhone)) throw new Error(`${file}: unverified phone number detected`);
  if (file.endsWith(".svg") && /<script\b/i.test(source)) throw new Error(`${file}: script is not allowed in brand assets`);
  if (/TURNSTILE_SECRET_KEY\s*[:=]\s*["'][^"']+["']/.test(source)) throw new Error(`${file}: Turnstile secret must not be hardcoded`);
  if (/PII_ENCRYPTION_KEY\s*[:=]\s*["'][^"']+["']/.test(source)) throw new Error(`${file}: PII key must not be hardcoded`);
}
console.log(`Checked ${files.length} source files`);

import { access, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const required = [
  "packages/contracts/operations.js",
  "packages/compliance/rules.js",
  "apps/ops-app/migrations/0003_operations_core.sql",
  "docs/data/p0-data-dictionary.md",
  "docs/operations/mock-phone-visit-intake-pack.md",
  "docs/compliance/mock-2026-submission-calendar.md",
  "docs/roadmap/p0-progress.md",
  "mock-documents/mock-p0-intake-pack.json"
];

const PLACEHOLDER_D1_ID = "00000000-0000-0000-0000-000000000000";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function evaluateP0Readiness(wranglerText) {
  let config;
  try {
    config = JSON.parse(wranglerText);
  } catch {
    config = null;
  }

  const configValid = isRecord(config);
  const vars = configValid && isRecord(config.vars) ? config.vars : {};
  const databases = configValid && Array.isArray(config.d1_databases) ? config.d1_databases : [];
  const database = databases[0];
  const serialized = configValid ? JSON.stringify(config) : "";

  return Object.freeze({
    configValid,
    mockDataOnly: vars.DATA_MODE === "mock",
    publicIntakeDisabled: vars.INTAKE_ENABLED === "false",
    sduiDisabled: vars.SDUI_ENABLED === "false",
    sduiRevisionPinned: vars.SDUI_REVISION === "1",
    remoteDatabaseUnconfigured: databases.length === 1
      && isRecord(database)
      && database.binding === "DB"
      && database.database_name === "harmony-ops-mock"
      && database.database_id === PLACEHOLDER_D1_ID
      && database.migrations_dir === "migrations"
      && !Object.hasOwn(database, "preview_database_id"),
    environmentOverridesAbsent: configValid && !Object.hasOwn(config, "env"),
    publicRoutesDisabled: configValid
      && config.workers_dev === false
      && !Object.hasOwn(config, "route")
      && !Object.hasOwn(config, "routes"),
    accessConfiguredInRepository: !configValid || /ACCESS_TEAM_DOMAIN|ACCESS_AUD/.test(serialized),
    secretsCommitted: !configValid || /PII_ENCRYPTION_KEY|PII_KEY_CURRENT_ID|AUDIT_HMAC_KEY|AUDIT_KEY_ID|TURNSTILE_SECRET_KEY/.test(serialized)
  });
}

export function assertP0Readiness(gates) {
  if (
    !gates.configValid
    || !gates.mockDataOnly
    || !gates.publicIntakeDisabled
    || !gates.sduiDisabled
    || !gates.sduiRevisionPinned
    || !gates.remoteDatabaseUnconfigured
    || !gates.environmentOverridesAbsent
    || !gates.publicRoutesDisabled
    || gates.accessConfiguredInRepository
    || gates.secretsCommitted
  ) {
    throw new Error(`P0 안전 게이트 실패: ${JSON.stringify(gates)}`);
  }
  return gates;
}

export async function checkP0Readiness() {
  for (const file of required) await access(file);
  const wrangler = await readFile("apps/ops-app/wrangler.mock.jsonc", "utf8");
  const gates = assertP0Readiness(evaluateP0Readiness(wrangler));
  const result = {
    ok: true,
    mode: "mock",
    message: "P0 Mock 개발 준비는 완료됐고 실제 D1·Access·MFA·비밀키·SDUI 활성화가 없어 운영 배포는 차단된 상태입니다.",
    files: required.length,
    gates
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await checkP0Readiness();
}

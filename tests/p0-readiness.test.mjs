import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assertP0Readiness, evaluateP0Readiness } from "../scripts/check-p0-readiness.mjs";

const wrangler = await readFile(new URL("../apps/ops-app/wrangler.mock.jsonc", import.meta.url), "utf8");

function changedConfig(change) {
  const config = JSON.parse(wrangler);
  change(config);
  return JSON.stringify(config);
}

function assertBlocked(configText, gate) {
  const gates = evaluateP0Readiness(configText);
  assert.equal(gates[gate], false, `${gate} must fail closed`);
  assert.throws(() => assertP0Readiness(gates), /P0 안전 게이트 실패/);
}

test("P0 설정은 Mock·접수/SDUI 비활성·revision 1·D1 placeholder를 모두 요구한다", () => {
  const gates = assertP0Readiness(evaluateP0Readiness(wrangler));
  assert.deepEqual(gates, {
    configValid: true,
    mockDataOnly: true,
    publicIntakeDisabled: true,
    sduiDisabled: true,
    sduiRevisionPinned: true,
    remoteDatabaseUnconfigured: true,
    environmentOverridesAbsent: true,
    publicRoutesDisabled: true,
    accessConfiguredInRepository: false,
    secretsCommitted: false
  });
});

test("실제·preview·추가 D1 binding은 P0 readiness를 실패시킨다", () => {
  const cases = [
    changedConfig((config) => { config.d1_databases[0].database_id = "11111111-2222-4333-8444-555555555555"; }),
    changedConfig((config) => { config.d1_databases[0].preview_database_id = "11111111-2222-4333-8444-555555555555"; }),
    changedConfig((config) => { config.d1_databases.push(structuredClone(config.d1_databases[0])); }),
    changedConfig((config) => { config.d1_databases[0].binding = "OTHER_DB"; }),
    changedConfig((config) => { config.d1_databases[0].database_name = "production"; }),
    changedConfig((config) => { config.d1_databases[0].migrations_dir = "../outside"; })
  ];
  for (const configText of cases) assertBlocked(configText, "remoteDatabaseUnconfigured");
});

test("SDUI flag와 revision은 정확한 문자열 false·1만 통과한다", () => {
  for (const value of [true, false, "true", "False", "0", null]) {
    assertBlocked(changedConfig((config) => { config.vars.SDUI_ENABLED = value; }), "sduiDisabled");
  }
  assertBlocked(changedConfig((config) => { delete config.vars.SDUI_ENABLED; }), "sduiDisabled");

  for (const value of [1, "2", "latest", null]) {
    assertBlocked(changedConfig((config) => { config.vars.SDUI_REVISION = value; }), "sduiRevisionPinned");
  }
  assertBlocked(changedConfig((config) => { delete config.vars.SDUI_REVISION; }), "sduiRevisionPinned");
});

test("환경 override·공개 route·workers.dev 활성화는 P0에서 금지한다", () => {
  assertBlocked(changedConfig((config) => {
    config.env = { production: { vars: { SDUI_ENABLED: "true" } } };
  }), "environmentOverridesAbsent");
  assertBlocked(changedConfig((config) => { config.routes = ["ops.example.test/*"]; }), "publicRoutesDisabled");
  assertBlocked(changedConfig((config) => { config.workers_dev = true; }), "publicRoutesDisabled");
});

test("주석 decoy·손상 JSON과 Access/secret 값은 fail-closed로 차단한다", () => {
  assertBlocked(`// ${wrangler}`, "configValid");

  const accessGates = evaluateP0Readiness(changedConfig((config) => { config.vars.ACCESS_AUD = "mock-audience"; }));
  assert.equal(accessGates.accessConfiguredInRepository, true);
  assert.throws(() => assertP0Readiness(accessGates), /P0 안전 게이트 실패/);

  for (const secretName of ["AUDIT_KEY_ID", "TURNSTILE_SECRET_KEY"]) {
    const secretGates = evaluateP0Readiness(changedConfig((config) => { config.vars[secretName] = "not-a-secret-value"; }));
    assert.equal(secretGates.secretsCommitted, true);
    assert.throws(() => assertP0Readiness(secretGates), /P0 안전 게이트 실패/);
  }
});

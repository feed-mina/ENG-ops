import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = JSON.parse(await readFile(
  new URL("../apps/ops-app/wrangler.staging.jsonc", import.meta.url),
  "utf8"
));

test("staging Worker는 합성 Mock과 단일 staging D1만 사용한다", () => {
  assert.equal(config.name, "harmony-ops-staging");
  assert.equal(config.workers_dev, true);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.vars, {
    DATA_MODE: "mock",
    INTAKE_ENABLED: "false",
    SDUI_ENABLED: "true",
    SDUI_REVISION: "1"
  });
  assert.deepEqual(config.d1_databases, [{
    binding: "DB",
    database_name: "harmony-ops-staging",
    database_id: "eecc2bc7-1f83-4f77-9b73-8237c14eadaa",
    migrations_dir: "migrations"
  }]);
});

test("staging 설정에는 Access 값·비밀키·운영 route를 커밋하지 않는다", () => {
  const serialized = JSON.stringify(config);
  assert.doesNotMatch(serialized, /ACCESS_TEAM_DOMAIN|ACCESS_AUD/);
  assert.doesNotMatch(serialized, /PII_ENCRYPTION_KEY|AUDIT_HMAC_KEY|secret/i);
  assert.equal(config.routes, undefined);
  assert.equal(config.route, undefined);
});

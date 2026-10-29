import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [manifest, html, worker] = await Promise.all([
  readFile(new URL("../dist/ops-web/build-manifest.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../dist/ops-web/index.html", import.meta.url), "utf8"),
  readFile(new URL("../dist/server/index.js", import.meta.url), "utf8")
]);

assert.equal(manifest.schema, "harmony.ops-web.build.v1");
assert.equal(manifest.sduiEnabled, true, "site deployment must enable ops-web");
assert.match(html, /href="\.\/renderer\.css"/);
assert.match(html, /href="\.\/styles\.css"/);
assert.match(html, /src="\.\/app\.js"/);
assert.match(worker, /env\.OPS_API\.fetch\(request\)/);
assert.match(worker, /media-src 'self' blob:/);
assert.match(worker, /microphone=\(self\)/);

console.log("Validated enabled ops-web site bundle, API forwarding, and recording headers.");

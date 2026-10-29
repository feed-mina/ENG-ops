import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

import { COMPONENT_REGISTRY, validateSduiDocument } from "../packages/sdui-contracts/index.js";
import {
  assertDocumentBindingsResolve,
  assertDocumentMessagesDefined,
  assertDocumentThemeTokensDefined,
  validateMessageDocument,
  validateThemeDocument
} from "../packages/sdui-contracts/package-assets.js";
import { validateHarmonyTemplateManifest } from "../packages/sdui-contracts/template-manifest.js";
import { assertSyntheticMockFixture } from "../packages/sdui-testing/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templateDir = path.join(root, "sdui", "harmony-ops");

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function resolveInside(base, reference) {
  const resolved = path.resolve(base, reference);
  const relative = path.relative(base, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    if (!relative) return resolved;
    throw new Error(`Unsafe template reference: ${reference}`);
  }
  return resolved;
}

const manifest = await readJson(path.join(templateDir, "template.manifest.json"));
const manifestSummary = validateHarmonyTemplateManifest(manifest);

for (const reference of manifestSummary.references) await access(resolveInside(templateDir, reference));

const contractSchema = await readJson(path.join(root, "packages", "sdui-contracts", "harmony.sdui.document.v1.schema.json"));
if (contractSchema.title !== "Harmony SDUI Document v1") throw new Error("Harmony JSON Schema title is missing");
const capabilitiesSchema = await readJson(path.join(root, "packages", "sdui-contracts", "harmony.sdui.capabilities.v1.schema.json"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateDocumentSchema = ajv.compile(contractSchema);
ajv.compile(capabilitiesSchema);

const theme = await readJson(resolveInside(templateDir, manifest.metadata.themeRef));
const messageDocument = await readJson(resolveInside(templateDir, manifest.metadata.messagesRef));
validateThemeDocument(theme);
validateMessageDocument(messageDocument);

const fixtureDir = path.join(templateDir, "fixtures");
const fixtures = (await readdir(fixtureDir)).filter((name) => name.endsWith(".json"));
if (fixtures.length === 0) throw new Error("At least one Mock data fixture is required");
const mockResources = {};
for (const fixtureName of fixtures) {
  const fixture = await readJson(path.join(fixtureDir, fixtureName));
  assertSyntheticMockFixture(fixture);
  if (typeof fixture.resourceId !== "string" || Object.hasOwn(mockResources, fixture.resourceId)) {
    throw new Error(`${fixtureName}: unique resourceId is required`);
  }
  mockResources[fixture.resourceId] = fixture.data;
}

const documentSummaries = [];
const manifestPageIds = new Set(manifest.pages.map((page) => page.id));
for (const page of manifest.pages) {
  const document = await readJson(resolveInside(templateDir, page.metadataRef));
  if (!validateDocumentSchema(document)) {
    throw new Error(`${page.id}: JSON Schema validation failed: ${ajv.errorsText(validateDocumentSchema.errors)}`);
  }
  const summary = validateSduiDocument(document);
  if (document.pageId !== page.id) throw new Error(`${page.id}: manifest pageId and document pageId differ`);
  if (document.themeRef !== theme.id) throw new Error(`${page.id}: document themeRef is not packaged`);
  assertDocumentThemeTokensDefined(document, theme);
  assertDocumentBindingsResolve(document, mockResources);
  for (const capability of summary.usedCapabilities) {
    const type = capability.split("@")[0];
    if (!manifest.components.includes(type) || !COMPONENT_REGISTRY[type]) throw new Error(`${page.id}: manifest is missing ${type}`);
  }
  for (const pageRef of summary.navigationPageRefs) {
    if (!manifestPageIds.has(pageRef)) throw new Error(`${page.id}: navigation page is not packaged: ${pageRef}`);
  }
  assertDocumentMessagesDefined(document, messageDocument);
  documentSummaries.push(summary);
}

console.log(JSON.stringify({
  ok: true,
  package: `${manifestSummary.id}@${manifestSummary.version}`,
  adapter: manifest.runtimeAdapters[0],
  pages: documentSummaries.map((summary) => ({
    documentId: summary.documentId,
    revision: summary.revision,
    nodes: summary.nodeCount,
    bytes: summary.byteLength
  })),
  mockFixtures: fixtures.length
}, null, 2));

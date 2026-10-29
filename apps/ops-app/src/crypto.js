const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Uint8Array.from(atob(`${normalized}${padding}`), (character) => character.charCodeAt(0));
}

function loadKeyBytes(encodedKey) {
  if (!encodedKey) throw new Error("PII 암호화 키가 없어 작업을 중단했습니다.");
  const bytes = fromBase64Url(encodedKey);
  if (bytes.byteLength !== 32) throw new Error("PII 암호화 키는 32바이트여야 합니다.");
  return bytes;
}

async function importAesKey(encodedKey, usages) {
  return crypto.subtle.importKey("raw", loadKeyBytes(encodedKey), { name: "AES-GCM" }, false, usages);
}

export async function encryptPersonalField(value, context, env) {
  const keyId = String(env.PII_KEY_CURRENT_ID ?? "").trim();
  if (!keyId) throw new Error("PII 키 식별자가 없어 작업을 중단했습니다.");
  const key = await importAesKey(env.PII_ENCRYPTION_KEY, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(context), tagLength: 128 },
    key,
    encoder.encode(String(value))
  );
  return JSON.stringify({ version: 1, keyId, algorithm: "A256GCM", iv: toBase64Url(iv), ciphertext: toBase64Url(new Uint8Array(ciphertext)) });
}

export async function decryptPersonalField(envelopeJson, context, env) {
  const envelope = JSON.parse(envelopeJson);
  if (envelope.version !== 1 || envelope.algorithm !== "A256GCM") throw new Error("지원하지 않는 암호문 형식입니다.");
  if (envelope.keyId !== env.PII_KEY_CURRENT_ID) throw new Error("현재 키로 열 수 없는 암호문입니다. 키 교체 절차를 확인하세요.");
  const key = await importAesKey(env.PII_ENCRYPTION_KEY, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(envelope.iv), additionalData: encoder.encode(context), tagLength: 128 },
    key,
    fromBase64Url(envelope.ciphertext)
  );
  return decoder.decode(plaintext);
}

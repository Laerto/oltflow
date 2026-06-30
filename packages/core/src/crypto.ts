import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function loadKey(keyB64: string): Buffer {
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) {
    throw new Error("OLT_CRED_KEY duhet të jetë 32 bytes (base64) për AES-256-GCM");
  }
  return key;
}

/** AES-256-GCM encrypt -> base64(iv || authTag || ciphertext). */
export function encryptSecret(plain: string, keyB64: string): string {
  const key = loadKey(keyB64);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptSecret(encoded: string, keyB64: string): string {
  const key = loadKey(keyB64);
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + 16);
  const ciphertext = raw.subarray(IV_LEN + 16);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

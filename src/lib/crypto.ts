import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { env } from "./env";

// APP_SECRET can be any passphrase; we hash it down to a 32-byte AES-256 key.
function key(): Buffer {
  return createHash("sha256").update(env.appSecret).digest();
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decrypt(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}

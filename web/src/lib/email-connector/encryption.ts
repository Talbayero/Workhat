import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

function getKey() {
  const secret = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("EMAIL_TOKEN_ENCRYPTION_KEY is required to store mailbox tokens");
  }

  try {
    const decoded = Buffer.from(secret, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // Fall through to deterministic hashing for human-entered secrets.
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptSecret(value: string) {
  const [version, iv, tag, encrypted] = value.split(":");
  if (version !== VERSION || !iv || !tag || !encrypted) {
    throw new Error("Unsupported encrypted secret format");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

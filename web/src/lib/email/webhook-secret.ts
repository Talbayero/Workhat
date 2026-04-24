import { createHash, randomBytes, timingSafeEqual } from "crypto";

const HASH_PREFIX = "sha256:";

export function generateInboundWebhookSecret() {
  return `wh_in_${randomBytes(24).toString("base64url")}`;
}

export function inboundWebhookSecretHint(secret: string) {
  return `${secret.slice(0, 8)}...${secret.slice(-6)}`;
}

export function hashInboundWebhookSecret(secret: string) {
  return `${HASH_PREFIX}${createHash("sha256").update(secret, "utf8").digest("hex")}`;
}

export function verifyInboundWebhookSecretHash(token: string, storedHash: string) {
  if (!token || !storedHash.startsWith(HASH_PREFIX)) return false;

  const actual = Buffer.from(hashInboundWebhookSecret(token), "utf8");
  const expected = Buffer.from(storedHash, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

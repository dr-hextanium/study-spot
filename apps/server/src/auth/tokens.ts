import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes as base64url without padding (43 characters). */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hex. Only hashes of invite and session tokens are stored. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

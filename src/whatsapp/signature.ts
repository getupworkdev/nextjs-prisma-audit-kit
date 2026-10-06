import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify the X-Hub-Signature-256 header Meta sends with every webhook POST.
 * The signature is "sha256=" + HMAC-SHA256(appSecret, rawBody).
 *
 * Two mistakes an audit looks for:
 *  1. Verifying against the parsed and re-serialised JSON instead of the raw
 *     bytes. Key order or whitespace changes break the HMAC.
 *  2. Comparing with === instead of a constant-time compare.
 */
export function verifyMetaSignature(rawBody: Buffer | string, header: string | undefined, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const provided = header.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(provided)) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Helper for tests and for signing outbound requests to a mock provider. */
export function signBody(rawBody: Buffer | string, appSecret: string): string {
  return "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
}

/**
 * Meta's webhook verification handshake (GET). Returns the challenge to echo
 * back when the token matches, otherwise null.
 */
export function handleVerificationHandshake(
  query: Record<string, string | undefined>,
  verifyToken: string,
): string | null {
  if (query["hub.mode"] !== "subscribe") return null;
  if (query["hub.verify_token"] !== verifyToken) return null;
  return query["hub.challenge"] ?? null;
}

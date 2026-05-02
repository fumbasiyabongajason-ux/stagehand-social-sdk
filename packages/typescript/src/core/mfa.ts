/**
 * MFA helpers. TOTP code generation via `otpauth`, plus a small helper that
 * resolves a challenge through (in order): TOTP secret, user callback, error.
 */

import { TOTP, Secret } from "otpauth";
import type { Credentials, MfaCallback, MfaChallenge } from "./types.js";
import { MfaRequiredError } from "./errors.js";

/** Generate a 6-digit TOTP code for an authenticator-style 2FA secret. */
export function generateTotpCode(totpSecret: string): string {
  const cleaned = totpSecret.replace(/\s+/g, "").toUpperCase();
  const totp = new TOTP({
    issuer: "stagehand-social-sdk",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(cleaned),
  });
  return totp.generate();
}

/**
 * Resolve an MFA challenge using whatever the caller has configured.
 *
 * Resolution order:
 *   1. If `credentials.totpSecret` is set AND channel == "authenticator",
 *      generate a TOTP code locally.
 *   2. Else if `onMfaChallenge` is provided, call it.
 *   3. Else throw `MfaRequiredError` with the challenge for the caller to handle.
 */
export async function resolveMfa(
  challenge: MfaChallenge,
  credentials: Credentials,
  onMfaChallenge?: MfaCallback,
): Promise<string> {
  if (credentials.totpSecret && challenge.channel === "authenticator") {
    return generateTotpCode(credentials.totpSecret);
  }
  if (onMfaChallenge) {
    const code = await onMfaChallenge(challenge);
    if (!code || code.trim().length === 0) {
      throw new MfaRequiredError(
        "MFA callback returned empty code",
        challenge,
      );
    }
    return code.trim();
  }
  throw new MfaRequiredError(
    `MFA required (${challenge.channel}): ${challenge.description}. ` +
      `Set a TOTP secret or provide an onMfaChallenge callback.`,
    challenge,
  );
}

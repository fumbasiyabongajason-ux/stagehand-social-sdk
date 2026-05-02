"""MFA helpers — mirror of packages/typescript/src/core/mfa.ts."""

from __future__ import annotations

from typing import Optional

import pyotp

from stagehand_social.core.errors import MfaRequiredError
from stagehand_social.core.types import Credentials, MfaCallback, MfaChallenge


def generate_totp_code(totp_secret: str) -> str:
    """Generate a 6-digit TOTP code."""
    cleaned = totp_secret.replace(" ", "").upper()
    return pyotp.TOTP(cleaned).now()


async def resolve_mfa(
    challenge: MfaChallenge,
    credentials: Credentials,
    on_mfa_challenge: Optional[MfaCallback] = None,
) -> str:
    """Resolve an MFA challenge.

    Resolution order:
      1. TOTP secret if channel == "authenticator".
      2. on_mfa_challenge callback if provided.
      3. Raise MfaRequiredError.
    """
    if credentials.totp_secret and challenge.channel == "authenticator":
        return generate_totp_code(credentials.totp_secret)
    if on_mfa_challenge is not None:
        code = await on_mfa_challenge(challenge)
        if not code or not code.strip():
            raise MfaRequiredError("MFA callback returned empty code", challenge.__dict__)
        return code.strip()
    raise MfaRequiredError(
        f"MFA required ({challenge.channel}): {challenge.description}. "
        "Set a TOTP secret or provide an on_mfa_challenge callback.",
        challenge.__dict__,
    )

"""Error hierarchy — mirror of packages/typescript/src/core/errors.ts."""

from __future__ import annotations

from typing import Any, Optional


class SocialSDKError(Exception):
    """Base error class for the SDK."""

    def __init__(self, message: str, cause: Optional[Any] = None):
        super().__init__(message)
        self.cause = cause


class AuthenticationError(SocialSDKError):
    """Credentials missing or invalid."""


class MfaRequiredError(SocialSDKError):
    """Platform asked for MFA and no callback / TOTP secret was available."""

    def __init__(
        self,
        message: str,
        challenge: Optional[dict] = None,
        cause: Optional[Any] = None,
    ):
        super().__init__(message, cause)
        self.challenge = challenge or {}


class ChallengeError(SocialSDKError):
    """Action blocked by a captcha / unusual-activity wall."""


class RateLimitError(SocialSDKError):
    """Platform rate-limited or temporarily blocked the action."""

    def __init__(
        self,
        message: str,
        retry_after_seconds: Optional[int] = None,
        cause: Optional[Any] = None,
    ):
        super().__init__(message, cause)
        self.retry_after_seconds = retry_after_seconds


class ElementNotFoundError(SocialSDKError):
    """Stagehand could not find or interpret the element."""


class SessionError(SocialSDKError):
    """Browserbase context/session error."""


class ConfigError(SocialSDKError):
    """User-facing config missing or malformed."""

/**
 * Error hierarchy for the SDK. All thrown errors extend SocialSDKError so
 * callers can `catch` with a single check.
 */

export class SocialSDKError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SocialSDKError";
    if (cause instanceof Error) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

/** Credentials missing or invalid. */
export class AuthenticationError extends SocialSDKError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "AuthenticationError";
  }
}

/** Platform asked for MFA and no callback / TOTP secret was available. */
export class MfaRequiredError extends SocialSDKError {
  constructor(
    message: string,
    public readonly challenge: { description: string; channel: string },
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = "MfaRequiredError";
  }
}

/** Action blocked by a captcha / unusual-activity wall. */
export class ChallengeError extends SocialSDKError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "ChallengeError";
  }
}

/** Platform rate-limited or temporarily blocked the action. */
export class RateLimitError extends SocialSDKError {
  constructor(
    message: string,
    public readonly retryAfterSeconds?: number,
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = "RateLimitError";
  }
}

/** Stagehand `act()` could not find the element or interpret the instruction. */
export class ElementNotFoundError extends SocialSDKError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "ElementNotFoundError";
  }
}

/** Browserbase context/session error. */
export class SessionError extends SocialSDKError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "SessionError";
  }
}

/** User-facing config missing or malformed. */
export class ConfigError extends SocialSDKError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "ConfigError";
  }
}

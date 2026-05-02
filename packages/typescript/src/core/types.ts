/**
 * Core types shared across all platform adapters and the generic site adapter.
 *
 * These types intentionally mirror the Python dataclasses in
 * `packages/python/stagehand_social/core/types.py` — keep them in sync.
 */

// ---------------------------------------------------------------------------
// Identity & sessions
// ---------------------------------------------------------------------------

/** All supported specialized platforms in v0.1.0. */
export type PlatformName =
  | "instagram"
  | "tiktok"
  | "x"
  | "facebook"
  | "youtube"
  | "linkedin"
  | "threads";

/**
 * A "target" is anything the SDK can authenticate against — a known platform
 * by name, or an arbitrary site keyed by user-supplied identifier (used by
 * `GenericSiteAdapter`).
 */
export type TargetKey =
  | { kind: "platform"; platform: PlatformName }
  | { kind: "generic"; siteId: string };

/** Credentials hydrated from env vars or supplied directly. */
export interface Credentials {
  username: string;
  password: string;
  /** TOTP secret for auto-filling 6-digit 2FA codes. Optional. */
  totpSecret?: string;
}

/**
 * MFA challenge sent to the user-supplied callback when a platform asks for a
 * code that the SDK can't auto-resolve (e.g., SMS, email).
 */
export interface MfaChallenge {
  /** Free-text description of what the platform is asking for. */
  description: string;
  /** Best guess at the channel: "sms" | "email" | "authenticator" | "unknown". */
  channel: "sms" | "email" | "authenticator" | "unknown";
  /** Optional masked hint shown by the platform (e.g., "+1 ***-***-1234"). */
  hint?: string;
}

export type MfaCallback = (challenge: MfaChallenge) => Promise<string>;

/**
 * Persistent identifier for a Browserbase context. Stored on disk between
 * runs so the SDK can resume sessions without re-authenticating.
 */
export interface SessionRef {
  target: TargetKey;
  /** Account label — usually the username, but user-supplied. */
  account: string;
  /** Browserbase context ID. */
  contextId: string;
  /** When this session was last verified as logged-in. */
  lastVerifiedAt?: string;
}

// ---------------------------------------------------------------------------
// Action inputs (specialized platform adapters)
// ---------------------------------------------------------------------------

export interface PostInput {
  /** Caption / body text. Optional for media-only posts. */
  text?: string;
  /**
   * Local file paths or absolute URLs to media files (images / videos).
   * Most platforms accept multiple; some are single-only — see platform docs.
   */
  media?: string[];
  /** Per-image alt text, parallel to `media`. */
  altText?: string[];
  /** Optional location tag (free text, platform interprets). */
  location?: string;
  /** Optional list of @mentions to include in the composer. */
  mentions?: string[];
  /** Optional list of hashtags (without the #). */
  hashtags?: string[];
}

export interface CommentInput {
  /** URL of the post / video / tweet to comment on. */
  url: string;
  text: string;
  /** If commenting as a reply to an existing comment, the parent's URL or ID. */
  replyTo?: string;
}

export interface LikeInput {
  url: string;
}

export interface FollowInput {
  /** @-handle without the leading @. */
  username: string;
}

// ---------------------------------------------------------------------------
// Action results
// ---------------------------------------------------------------------------

export interface ActionResult {
  success: boolean;
  /** Unix epoch ms when the action completed (server-observed). */
  at: number;
  /** Optional URL of the resource the action affected. */
  url?: string;
  /** Free-text notes (e.g., "post is processing — preview not yet visible"). */
  notes?: string;
}

export interface PostResult extends ActionResult {
  /** URL of the published post once visible. */
  postUrl?: string;
  /** Platform-assigned post ID, when extractable. */
  postId?: string;
}

export interface CommentResult extends ActionResult {
  commentId?: string;
}

export interface LikeResult extends ActionResult {
  /** Final state after the action (true = liked, false = unliked). */
  liked: boolean;
}

export interface FollowResult extends ActionResult {
  following: boolean;
}

// ---------------------------------------------------------------------------
// Generic site adapter
// ---------------------------------------------------------------------------

/** Spec for logging into an arbitrary website. */
export interface GenericLoginInput {
  /** URL of the login page (relative to baseUrl, or absolute). */
  loginUrl: string;
  /** Natural-language description of the username field. */
  usernameField?: string;
  /** Natural-language description of the password field. */
  passwordField?: string;
  /** Natural-language description of the submit button. */
  submit?: string;
  /** If false, skip the username step (some sites are passwordless). */
  hasUsername?: boolean;
  /** Override credentials (else pulled from env: STAGEHAND_SOCIAL_GENERIC_<SITEID>_*). */
  credentials?: Credentials;
}

export interface GenericExtractInput<T = unknown> {
  instruction: string;
  /**
   * Either a Zod schema or an object describing field types in plain English.
   * The SDK forwards whichever form is given to Stagehand's `extract()`.
   */
  schema?: unknown;
  /** Returned by `extract()` — the typed payload. */
  _phantom?: T;
}

// ---------------------------------------------------------------------------
// SDK-level config
// ---------------------------------------------------------------------------

export interface BrowserbaseConfig {
  apiKey: string;
  projectId: string;
}

export interface LLMConfig {
  /** "anthropic" or "openai". */
  provider: "anthropic" | "openai";
  apiKey: string;
  /** Override the default model (e.g., "claude-sonnet-4-20250514"). */
  model?: string;
}

export interface SocialSDKConfig {
  browserbase: BrowserbaseConfig;
  llm: LLMConfig;
  /** Optional MFA challenge handler. */
  onMfaChallenge?: MfaCallback;
  /** Where to cache session refs on disk. Default: ~/.stagehand-social */
  sessionDir?: string;
  /** Run Stagehand in headless mode. Default: true. */
  headless?: boolean;
  /** Log level. Default: "info". */
  logLevel?: "debug" | "info" | "warn" | "error";
}

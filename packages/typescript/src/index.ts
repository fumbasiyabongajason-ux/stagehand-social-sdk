/**
 * @stagehand-social/sdk — public entry point.
 *
 * Top-level exports:
 *   - SocialSDK  → factory + platform accessors
 *   - GenericSiteAdapter → drive any website
 *   - BasePlatform → for users implementing custom platform adapters
 *   - All types, all error classes
 *
 * Per-platform adapters are also re-exported so users can construct them
 * directly when they need fine-grained control (e.g., bypass the factory).
 */

// Core
export { SocialSDK } from "./core/SocialSDK.js";
export { BasePlatform } from "./core/BasePlatform.js";
export { SessionManager } from "./core/session.js";
export { generateTotpCode, resolveMfa } from "./core/mfa.js";

// Generic site
export { GenericSiteAdapter } from "./generic/GenericSiteAdapter.js";

// Platform adapters
export { InstagramAdapter } from "./platforms/instagram.js";
export { TikTokAdapter } from "./platforms/tiktok.js";
export { XAdapter } from "./platforms/x.js";
export { FacebookAdapter } from "./platforms/facebook.js";
export { YouTubeAdapter } from "./platforms/youtube.js";
export { LinkedInAdapter } from "./platforms/linkedin.js";
export { ThreadsAdapter } from "./platforms/threads.js";

// Types
export type {
  PlatformName,
  TargetKey,
  Credentials,
  SessionRef,
  PostInput,
  CommentInput,
  LikeInput,
  FollowInput,
  PostResult,
  CommentResult,
  LikeResult,
  FollowResult,
  ActionResult,
  GenericLoginInput,
  GenericExtractInput,
  MfaChallenge,
  MfaCallback,
  SocialSDKConfig,
  BrowserbaseConfig,
  LLMConfig,
} from "./core/types.js";

// Errors
export {
  SocialSDKError,
  AuthenticationError,
  MfaRequiredError,
  ChallengeError,
  RateLimitError,
  ElementNotFoundError,
  SessionError,
  ConfigError,
} from "./core/errors.js";

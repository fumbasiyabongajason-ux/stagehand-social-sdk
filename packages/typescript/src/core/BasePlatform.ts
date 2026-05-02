/**
 * Abstract base class for all specialized platform adapters.
 *
 * Each platform (instagram, tiktok, x, etc.) extends this and implements
 * the abstract methods. Stagehand is owned by this class — subclasses just
 * issue `act()` / `extract()` calls via `this.stagehand`.
 *
 * Lifecycle:
 *   1. SocialSDK.create() → instantiates an adapter with a SessionManager.
 *   2. adapter.login() → opens a Stagehand session against the platform's
 *      Browserbase context, drives the login flow, marks the session verified.
 *   3. adapter.post() / .comment() / etc. → reuses the open session.
 *   4. adapter.close() → tears down the Stagehand session (context persists).
 */

import { Stagehand } from "@browserbasehq/stagehand";
import type {
  Credentials,
  CommentInput,
  CommentResult,
  FollowInput,
  FollowResult,
  LikeInput,
  LikeResult,
  MfaCallback,
  PlatformName,
  PostInput,
  PostResult,
  TargetKey,
} from "./types.js";
import { AuthenticationError, ConfigError } from "./errors.js";
import { SessionManager } from "./session.js";

export interface BasePlatformOpts {
  platform: PlatformName;
  account: string;
  sessionManager: SessionManager;
  credentials?: Credentials;
  onMfaChallenge?: MfaCallback;
  llm: { provider: "anthropic" | "openai"; apiKey: string; model?: string };
  headless?: boolean;
  logLevel?: "debug" | "info" | "warn" | "error";
}

export abstract class BasePlatform {
  /** Sub-domain of social media this adapter handles. */
  public readonly platform: PlatformName;

  /** Account label — used to disambiguate multi-account setups. */
  public readonly account: string;

  /** Built lazily on first action. */
  protected stagehand?: Stagehand;

  /** Resolved credentials (env vars or constructor override). */
  protected credentials?: Credentials;

  protected readonly sessionManager: SessionManager;
  protected readonly onMfaChallenge?: MfaCallback;
  protected readonly llmConfig: BasePlatformOpts["llm"];
  protected readonly headless: boolean;
  protected readonly logLevel: NonNullable<BasePlatformOpts["logLevel"]>;

  constructor(opts: BasePlatformOpts) {
    this.platform = opts.platform;
    this.account = opts.account;
    this.sessionManager = opts.sessionManager;
    this.credentials = opts.credentials;
    this.onMfaChallenge = opts.onMfaChallenge;
    this.llmConfig = opts.llm;
    this.headless = opts.headless ?? true;
    this.logLevel = opts.logLevel ?? "info";
  }

  // -------------------------------------------------------------------------
  // Subclass contract — must implement
  // -------------------------------------------------------------------------

  /** URL of the platform's main login page. */
  protected abstract loginUrl(): string;

  /** Drive the login flow once Stagehand is on the login page. */
  protected abstract performLogin(creds: Credentials): Promise<void>;

  /** Detect whether the current browser is logged in (heuristic per platform). */
  abstract isLoggedIn(): Promise<boolean>;

  /** Publish a new post. */
  abstract post(input: PostInput): Promise<PostResult>;

  /** Add a comment to an existing post. */
  abstract comment(input: CommentInput): Promise<CommentResult>;

  /** Like a post. */
  abstract like(input: LikeInput): Promise<LikeResult>;

  /** Unlike a post. */
  abstract unlike(input: LikeInput): Promise<LikeResult>;

  /** Follow an account. */
  abstract follow(input: FollowInput): Promise<FollowResult>;

  /** Unfollow an account. */
  abstract unfollow(input: FollowInput): Promise<FollowResult>;

  // -------------------------------------------------------------------------
  // Shared concrete methods
  // -------------------------------------------------------------------------

  /** Get the running Stagehand instance, creating it on first call. */
  protected async getStagehand(): Promise<Stagehand> {
    if (this.stagehand) return this.stagehand;

    const target: TargetKey = { kind: "platform", platform: this.platform };
    const contextId = await this.sessionManager.getOrCreateContext(
      target,
      this.account,
    );
    const sessionParams = this.sessionManager.buildSessionParams(contextId);

    this.stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey: undefined, // SDK reads BROWSERBASE_API_KEY from env automatically when env is BROWSERBASE
      projectId: sessionParams.projectId,
      browserbaseSessionCreateParams: sessionParams,
      modelName: this.llmConfig.model,
      modelClientOptions: { apiKey: this.llmConfig.apiKey },
      verbose: this.logLevel === "debug" ? 2 : this.logLevel === "info" ? 1 : 0,
      headless: this.headless,
    });

    await this.stagehand.init();
    return this.stagehand;
  }

  /**
   * Top-level login. Resolves credentials, ensures Stagehand is running,
   * navigates to login URL, calls subclass `performLogin`, verifies, persists.
   */
  async login(creds?: Credentials): Promise<void> {
    const resolved = creds ?? this.credentials ?? this.loadCredsFromEnv();
    if (!resolved) {
      throw new ConfigError(
        `No credentials for ${this.platform}. Set ` +
          `STAGEHAND_SOCIAL_${this.platform.toUpperCase()}_USERNAME / _PASSWORD ` +
          `or pass them to login().`,
      );
    }
    this.credentials = resolved;

    const sh = await this.getStagehand();

    // Already logged in (cookie persisted from a prior run)?
    if (await this.isLoggedIn().catch(() => false)) {
      await this.sessionManager.markVerified(
        { kind: "platform", platform: this.platform },
        this.account,
      );
      return;
    }

    await sh.page.goto(this.loginUrl());
    await this.performLogin(resolved);

    if (!(await this.isLoggedIn())) {
      throw new AuthenticationError(
        `${this.platform} login appeared to succeed but isLoggedIn() returned false.`,
      );
    }

    await this.sessionManager.markVerified(
      { kind: "platform", platform: this.platform },
      this.account,
    );
  }

  /** Tear down the Stagehand session. Browserbase context persists for next run. */
  async close(): Promise<void> {
    if (!this.stagehand) return;
    try {
      await this.stagehand.close();
    } finally {
      this.stagehand = undefined;
    }
  }

  /** Default logout — most subclasses don't need to override. */
  async logout(): Promise<void> {
    const sh = await this.getStagehand();
    try {
      await sh.page.act("Open the user menu and click 'Log out'");
    } finally {
      await this.sessionManager.forget(
        { kind: "platform", platform: this.platform },
        this.account,
      );
      await this.close();
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  protected loadCredsFromEnv(): Credentials | undefined {
    const prefix = `STAGEHAND_SOCIAL_${this.platform.toUpperCase()}`;
    const username = process.env[`${prefix}_USERNAME`];
    const password = process.env[`${prefix}_PASSWORD`];
    const totpSecret = process.env[`${prefix}_TOTP_SECRET`];
    if (!username || !password) return undefined;
    return { username, password, totpSecret };
  }

  /** Convenience: timestamp for ActionResult.at. */
  protected now(): number {
    return Date.now();
  }
}

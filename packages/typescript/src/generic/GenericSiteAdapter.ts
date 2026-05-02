/**
 * GenericSiteAdapter — drive any website with Stagehand's natural-language
 * primitives. Use this when there's no specialized adapter for the platform
 * you need.
 *
 * Example:
 *   const site = sdk.generic({ baseUrl: "https://news.ycombinator.com",
 *                              account: "myhandle", siteId: "hn" });
 *   await site.login({
 *     loginUrl: "/login",
 *     usernameField: "the username field",
 *     passwordField: "the password field",
 *     submit: "the login button",
 *   });
 *   await site.act("Click the upvote arrow on the third story");
 *   const data = await site.extract({
 *     instruction: "Top 5 story titles and their points",
 *   });
 */

import { Stagehand } from "@browserbasehq/stagehand";
import type {
  Credentials,
  GenericLoginInput,
  MfaCallback,
  TargetKey,
} from "../core/types.js";
import {
  AuthenticationError,
  ConfigError,
  SocialSDKError,
} from "../core/errors.js";
import { SessionManager } from "../core/session.js";

export interface GenericSiteOpts {
  /** Stable identifier for this site (used in env var names + session keys). */
  siteId: string;
  /** Base URL — e.g., "https://news.ycombinator.com". */
  baseUrl: string;
  /** Account label for multi-account setups; defaults to "default". */
  account?: string;
  sessionManager: SessionManager;
  credentials?: Credentials;
  onMfaChallenge?: MfaCallback;
  llm: { provider: "anthropic" | "openai"; apiKey: string; model?: string };
  headless?: boolean;
  logLevel?: "debug" | "info" | "warn" | "error";
}

export class GenericSiteAdapter {
  public readonly siteId: string;
  public readonly baseUrl: string;
  public readonly account: string;

  private stagehand?: Stagehand;
  private credentials?: Credentials;

  private readonly sessionManager: SessionManager;
  private readonly onMfaChallenge?: MfaCallback;
  private readonly llmConfig: GenericSiteOpts["llm"];
  private readonly headless: boolean;
  private readonly logLevel: NonNullable<GenericSiteOpts["logLevel"]>;

  constructor(opts: GenericSiteOpts) {
    this.siteId = opts.siteId;
    this.baseUrl = opts.baseUrl.replace(/\/$/, ""); // strip trailing slash
    this.account = opts.account ?? "default";
    this.sessionManager = opts.sessionManager;
    this.credentials = opts.credentials;
    this.onMfaChallenge = opts.onMfaChallenge;
    this.llmConfig = opts.llm;
    this.headless = opts.headless ?? true;
    this.logLevel = opts.logLevel ?? "info";
  }

  // -------------------------------------------------------------------------
  // Stagehand lifecycle
  // -------------------------------------------------------------------------

  private async getStagehand(): Promise<Stagehand> {
    if (this.stagehand) return this.stagehand;

    const target: TargetKey = { kind: "generic", siteId: this.siteId };
    const contextId = await this.sessionManager.getOrCreateContext(
      target,
      this.account,
    );
    const sessionParams = this.sessionManager.buildSessionParams(contextId);

    this.stagehand = new Stagehand({
      env: "BROWSERBASE",
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

  async close(): Promise<void> {
    if (!this.stagehand) return;
    try {
      await this.stagehand.close();
    } finally {
      this.stagehand = undefined;
    }
  }

  // -------------------------------------------------------------------------
  // Public API — primitives
  // -------------------------------------------------------------------------

  /** Navigate to a URL (relative paths resolve against baseUrl). */
  async navigate(url: string): Promise<void> {
    const sh = await this.getStagehand();
    const target = url.startsWith("http") ? url : `${this.baseUrl}${url.startsWith("/") ? url : `/${url}`}`;
    await sh.page.goto(target);
  }

  /**
   * Take an action by natural-language instruction.
   * Examples:
   *   - "Click the 'Sign in' button in the top right"
   *   - "Fill in 'My morning thoughts' as the post body"
   *   - "Scroll down to the comments section"
   */
  async act(instruction: string): Promise<void> {
    const sh = await this.getStagehand();
    await sh.page.act(instruction);
  }

  /**
   * Extract structured data from the current page.
   * Returns whatever shape Stagehand resolves from the instruction + schema.
   */
  async extract<T = unknown>(args: {
    instruction: string;
    schema?: unknown;
  }): Promise<T> {
    const sh = await this.getStagehand();
    // @ts-expect-error — Stagehand's extract() accepts schema in multiple forms
    return (await sh.page.extract({
      instruction: args.instruction,
      schema: args.schema,
    })) as T;
  }

  /** Observe possible actions on the current page (for debugging / planning). */
  async observe(instruction?: string): Promise<unknown> {
    const sh = await this.getStagehand();
    return await sh.page.observe(instruction ?? "What can I do on this page?");
  }

  // -------------------------------------------------------------------------
  // Convenience: generic login flow
  // -------------------------------------------------------------------------

  /**
   * Drive a username/password login flow on an arbitrary site.
   * Credentials are taken from the input, or from
   * STAGEHAND_SOCIAL_GENERIC_<SITEID>_USERNAME / _PASSWORD if not provided.
   */
  async login(input: GenericLoginInput): Promise<void> {
    const creds =
      input.credentials ??
      this.credentials ??
      this.loadCredsFromEnv();
    if (!creds) {
      throw new ConfigError(
        `No credentials for generic site '${this.siteId}'. Set ` +
          `STAGEHAND_SOCIAL_GENERIC_${this.siteId.toUpperCase()}_USERNAME ` +
          `and _PASSWORD, or pass credentials to login().`,
      );
    }
    this.credentials = creds;

    await this.navigate(input.loginUrl);

    const userField = input.usernameField ?? "the username or email field";
    const passField = input.passwordField ?? "the password field";
    const submitBtn = input.submit ?? "the sign in / log in button";

    if (input.hasUsername !== false) {
      await this.act(`Type "${creds.username}" into ${userField}`);
    }
    await this.act(`Type "${creds.password}" into ${passField}`);
    await this.act(`Click ${submitBtn}`);

    // Give the page a moment to settle after submit.
    const sh = await this.getStagehand();
    await sh.page.waitForLoadState("networkidle").catch(() => {});

    // Best-effort: detect 2FA prompt and route to MFA callback.
    const looksLikeMfa = await this.extract<{ mfaVisible: boolean; hint?: string }>({
      instruction:
        "Is the page asking for a verification / 2FA / authenticator code? " +
        "If so, return mfaVisible=true and any visible hint (e.g., masked phone). " +
        "Else mfaVisible=false.",
      schema: { mfaVisible: "boolean", hint: "string" },
    }).catch(() => ({ mfaVisible: false }));

    if (looksLikeMfa.mfaVisible) {
      const code = await this.resolveMfa(looksLikeMfa.hint, creds);
      await this.act(`Type "${code}" into the verification code field`);
      await this.act("Click the verify / submit button");
      await sh.page.waitForLoadState("networkidle").catch(() => {});
    }

    // Best-effort verification: check for an obviously-logged-in marker.
    const verified = await this.extract<{ loggedIn: boolean }>({
      instruction:
        "Look for any signal that the user is now logged in (a profile " +
        "avatar, username displayed in a menu, account dropdown, 'Logout' " +
        "link, etc.). Return loggedIn=true or false.",
      schema: { loggedIn: "boolean" },
    }).catch(() => ({ loggedIn: false }));

    if (!verified.loggedIn) {
      throw new AuthenticationError(
        `Generic login on '${this.siteId}' could not be verified. ` +
          `Check credentials or pass more specific field selectors.`,
      );
    }

    await this.sessionManager.markVerified(
      { kind: "generic", siteId: this.siteId },
      this.account,
    );
  }

  /** Best-effort logged-in heuristic for the current page. */
  async isLoggedIn(): Promise<boolean> {
    try {
      const { loggedIn } = await this.extract<{ loggedIn: boolean }>({
        instruction:
          "Is there any visible indicator that the user is logged in (profile " +
          "avatar, username, account menu, 'Logout' link)? Return loggedIn=true or false.",
        schema: { loggedIn: "boolean" },
      });
      return Boolean(loggedIn);
    } catch (err) {
      throw new SocialSDKError(
        `Could not determine login state for '${this.siteId}'`,
        err,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private loadCredsFromEnv(): Credentials | undefined {
    const prefix = `STAGEHAND_SOCIAL_GENERIC_${this.siteId.toUpperCase()}`;
    const username = process.env[`${prefix}_USERNAME`];
    const password = process.env[`${prefix}_PASSWORD`];
    const totpSecret = process.env[`${prefix}_TOTP_SECRET`];
    if (!username || !password) return undefined;
    return { username, password, totpSecret };
  }

  private async resolveMfa(
    hint: string | undefined,
    creds: Credentials,
  ): Promise<string> {
    const { resolveMfa } = await import("../core/mfa.js");
    return resolveMfa(
      {
        description: hint
          ? `Site requested 2FA code (hint: ${hint})`
          : "Site requested a 2FA / verification code",
        channel: "unknown",
        hint,
      },
      creds,
      this.onMfaChallenge,
    );
  }
}

/**
 * SocialSDK — top-level factory that wires up the SessionManager and exposes
 * lazy-instantiated platform adapters plus a `generic()` factory for arbitrary
 * websites.
 *
 * Usage:
 *   const sdk = await SocialSDK.create({ browserbase, llm });
 *   await sdk.platforms.instagram.login();
 *   await sdk.platforms.instagram.post({ text: "...", media: ["./img.jpg"] });
 *
 *   const reddit = sdk.generic({ siteId: "reddit", baseUrl: "https://reddit.com" });
 *   await reddit.login({ loginUrl: "/login" });
 */

import type {
  PlatformName,
  SocialSDKConfig,
} from "./types.js";
import { ConfigError } from "./errors.js";
import { SessionManager } from "./session.js";
import { BasePlatform } from "./BasePlatform.js";
import { GenericSiteAdapter, type GenericSiteOpts } from "../generic/GenericSiteAdapter.js";

// Platform adapters — lazy-imported to avoid pulling all 7 into every bundle.
type AdapterCtor = new (
  ...args: ConstructorParameters<typeof BasePlatform>
) => BasePlatform;

interface AdapterRegistry {
  instagram: AdapterCtor;
  tiktok: AdapterCtor;
  x: AdapterCtor;
  facebook: AdapterCtor;
  youtube: AdapterCtor;
  linkedin: AdapterCtor;
  threads: AdapterCtor;
}

async function loadAdapters(): Promise<AdapterRegistry> {
  const [
    { InstagramAdapter },
    { TikTokAdapter },
    { XAdapter },
    { FacebookAdapter },
    { YouTubeAdapter },
    { LinkedInAdapter },
    { ThreadsAdapter },
  ] = await Promise.all([
    import("../platforms/instagram.js"),
    import("../platforms/tiktok.js"),
    import("../platforms/x.js"),
    import("../platforms/facebook.js"),
    import("../platforms/youtube.js"),
    import("../platforms/linkedin.js"),
    import("../platforms/threads.js"),
  ]);
  return {
    instagram: InstagramAdapter as unknown as AdapterCtor,
    tiktok: TikTokAdapter as unknown as AdapterCtor,
    x: XAdapter as unknown as AdapterCtor,
    facebook: FacebookAdapter as unknown as AdapterCtor,
    youtube: YouTubeAdapter as unknown as AdapterCtor,
    linkedin: LinkedInAdapter as unknown as AdapterCtor,
    threads: ThreadsAdapter as unknown as AdapterCtor,
  };
}

export interface PlatformAccess {
  instagram: BasePlatform;
  tiktok: BasePlatform;
  x: BasePlatform;
  facebook: BasePlatform;
  youtube: BasePlatform;
  linkedin: BasePlatform;
  threads: BasePlatform;
}

export class SocialSDK {
  private readonly config: SocialSDKConfig;
  private readonly sessionManager: SessionManager;
  private readonly adapterRegistry: AdapterRegistry;
  private readonly adapterCache = new Map<string, BasePlatform>();
  private readonly genericCache = new Map<string, GenericSiteAdapter>();

  /** Default account label when caller doesn't pass one. */
  public defaultAccount = "default";

  /** Typed accessor for the 7 specialized platforms. */
  public readonly platforms: PlatformAccess;

  private constructor(
    config: SocialSDKConfig,
    sessionManager: SessionManager,
    adapterRegistry: AdapterRegistry,
  ) {
    this.config = config;
    this.sessionManager = sessionManager;
    this.adapterRegistry = adapterRegistry;

    const sdk = this;
    const make = (p: PlatformName): BasePlatform => sdk.platform(p);

    // Lazy-initialized via getters so unused platforms never instantiate Stagehand.
    this.platforms = {
      get instagram() { return make("instagram"); },
      get tiktok() { return make("tiktok"); },
      get x() { return make("x"); },
      get facebook() { return make("facebook"); },
      get youtube() { return make("youtube"); },
      get linkedin() { return make("linkedin"); },
      get threads() { return make("threads"); },
    };
  }

  static async create(config: SocialSDKConfig): Promise<SocialSDK> {
    if (!config.browserbase?.apiKey || !config.browserbase?.projectId) {
      throw new ConfigError(
        "browserbase.apiKey and browserbase.projectId are required",
      );
    }
    if (!config.llm?.apiKey) {
      throw new ConfigError("llm.apiKey is required");
    }

    const sessionManager = new SessionManager({
      apiKey: config.browserbase.apiKey,
      projectId: config.browserbase.projectId,
      sessionDir: config.sessionDir,
    });
    const adapters = await loadAdapters();
    return new SocialSDK(config, sessionManager, adapters);
  }

  /** Get (or build) a platform adapter for a given account. */
  platform(name: PlatformName, account?: string): BasePlatform {
    const acct = account ?? this.defaultAccount;
    const key = `${name}::${acct}`;
    const cached = this.adapterCache.get(key);
    if (cached) return cached;

    const Ctor = this.adapterRegistry[name];
    if (!Ctor) {
      throw new ConfigError(`Unknown platform: ${name}`);
    }
    const adapter = new Ctor({
      platform: name,
      account: acct,
      sessionManager: this.sessionManager,
      onMfaChallenge: this.config.onMfaChallenge,
      llm: this.config.llm,
      headless: this.config.headless,
      logLevel: this.config.logLevel,
    });
    this.adapterCache.set(key, adapter);
    return adapter;
  }

  /** Build a generic-site adapter for any URL. */
  generic(opts: {
    siteId: string;
    baseUrl: string;
    account?: string;
  }): GenericSiteAdapter {
    const acct = opts.account ?? this.defaultAccount;
    const key = `generic:${opts.siteId}::${acct}`;
    const cached = this.genericCache.get(key);
    if (cached) return cached;

    const generic = new GenericSiteAdapter({
      siteId: opts.siteId,
      baseUrl: opts.baseUrl,
      account: acct,
      sessionManager: this.sessionManager,
      onMfaChallenge: this.config.onMfaChallenge,
      llm: this.config.llm,
      headless: this.config.headless,
      logLevel: this.config.logLevel,
    } as GenericSiteOpts);
    this.genericCache.set(key, generic);
    return generic;
  }

  /** Tear down all open Stagehand sessions. Browserbase contexts persist. */
  async close(): Promise<void> {
    const all: Promise<unknown>[] = [];
    for (const adapter of this.adapterCache.values()) {
      all.push(adapter.close().catch(() => undefined));
    }
    for (const generic of this.genericCache.values()) {
      all.push(generic.close().catch(() => undefined));
    }
    await Promise.all(all);
    this.adapterCache.clear();
    this.genericCache.clear();
  }
}

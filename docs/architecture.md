# Architecture

## Two-tier API

```
                 ┌─────────────────────────────────────────────────┐
                 │                  SocialSDK                      │
                 │  (factory, session manager, MFA hook routing)   │
                 └────────────┬─────────────────────┬──────────────┘
                              │                     │
                              ▼                     ▼
              ┌────────────────────────┐  ┌──────────────────────┐
              │  Specialized adapters  │  │  Generic adapter     │
              │  (BasePlatform impls)  │  │  (any website)       │
              └────────────────────────┘  └──────────────────────┘
              │                                                  │
              ▼                                                  ▼
        Instagram, TikTok, X, Facebook,             site.act(NL instruction)
        YouTube, LinkedIn, Threads                  site.extract({...})
        — typed, opinionated API:                   site.navigate(url)
        post / comment / like / follow              site.login({...})
```

## Lifecycle

```
SocialSDK.create()
  └─ SessionManager: load cached refs from ~/.stagehand-social/sessions.json
  └─ adapterCache: empty Map

sdk.platforms.instagram        ← lazy: InstagramAdapter built on first access
  └─ ig.login()
      └─ SessionManager.getOrCreateContext("instagram", account)
          └─ existing context? reuse
          └─ no? Browserbase.contexts.create() → save ID
      └─ new Stagehand({ env: "BROWSERBASE", browserbaseSessionCreateParams: { context: { id, persist: true } } })
      └─ stagehand.init() — starts a remote browser session
      └─ if isLoggedIn()? → markVerified, return.
      └─ else → goto loginUrl → performLogin() → verify → markVerified.

ig.post({ text, media })       ← reuses open Stagehand
ig.like({ url })
ig.follow({ username })

sdk.close()                    ← closes all Stagehand sessions; contexts persist.
```

## BasePlatform contract

Every specialized adapter implements this interface:

```ts
abstract class BasePlatform {
  abstract loginUrl(): string;
  abstract performLogin(creds: Credentials): Promise<void>;
  abstract isLoggedIn(): Promise<boolean>;
  abstract post(input: PostInput): Promise<PostResult>;
  abstract comment(input: CommentInput): Promise<CommentResult>;
  abstract like(input: LikeInput): Promise<LikeResult>;
  abstract unlike(input: LikeInput): Promise<LikeResult>;
  abstract follow(input: FollowInput): Promise<FollowResult>;
  abstract unfollow(input: FollowInput): Promise<FollowResult>;

  // Concrete:
  async login(creds?: Credentials): Promise<void>;
  async logout(): Promise<void>;
  async close(): Promise<void>;
}
```

`login()` is concrete — it handles credential resolution (constructor → env var fallback), session reuse, and verification, then calls the subclass's `performLogin()` to drive the actual login UI.

## GenericSiteAdapter contract

```ts
class GenericSiteAdapter {
  async navigate(url: string): Promise<void>;
  async act(instruction: string): Promise<void>;
  async extract<T>(args: { instruction: string; schema?: any }): Promise<T>;
  async observe(instruction?: string): Promise<unknown>;
  async login(input: GenericLoginInput): Promise<void>;
  async isLoggedIn(): Promise<boolean>;
  async close(): Promise<void>;
}
```

## Sessions & Browserbase contexts

Each `(target, account)` pair gets a Browserbase **context** — a server-side cookie + storage bag that persists indefinitely. The SDK stores the context ID locally so future runs reuse the same logged-in browser without re-authenticating.

```
~/.stagehand-social/sessions.json
{
  "instagram::myaccount": {
    "target": { "kind": "platform", "platform": "instagram" },
    "account": "myaccount",
    "contextId": "ctx_abc123",
    "lastVerifiedAt": "2026-05-02T..."
  },
  "generic:hn::myaccount": { ... }
}
```

This file is **machine-local**; multiple machines can each have their own. To share contexts across CI runs, mount this file as a secret or persistent volume.

## Error model

All errors extend `SocialSDKError`:

| Class | When |
| --- | --- |
| `AuthenticationError` | Credentials wrong, login flow failed verification |
| `MfaRequiredError` | Platform asked for 2FA and no callback / TOTP secret was set |
| `ChallengeError` | Captcha, "suspicious activity", or similar wall |
| `RateLimitError` | Platform throttled the action (carries `retryAfterSeconds`) |
| `ElementNotFoundError` | Stagehand `act()` couldn't find or interpret the target |
| `SessionError` | Browserbase context / session error |
| `ConfigError` | Missing API key, unknown platform, etc. |

Recommended pattern:

```ts
try {
  await ig.post({ text, media });
} catch (err) {
  if (err instanceof RateLimitError) {
    await sleep((err.retryAfterSeconds ?? 60) * 1000);
    // retry
  } else if (err instanceof ChallengeError) {
    notifyHuman("Please solve captcha via Browserbase Live View");
  } else {
    throw err;
  }
}
```

## Why Stagehand `act()` instead of CSS selectors

CSS selectors break every time the platform redesigns. Stagehand's `act()` takes a natural-language instruction and uses LLM + DOM + vision to find the right element. When Instagram moves the "Share" button, the SDK still finds it because `act("Click the Share button to publish the post")` doesn't depend on `[data-testid="share-button-v2"]`.

When a platform changes too much (rare), the fix is usually a one-line tweak to the prompt — not a full rewrite of the adapter.

## Threading / concurrency

- Each platform adapter holds **one** Stagehand session at a time.
- Different `(platform, account)` pairs can run concurrently — they have independent contexts.
- Within a single adapter, calls are serialized — don't issue two `post()` calls in parallel on the same instance.

## Logging

Set `logLevel: "debug"` on `SocialSDK.create()` to see Stagehand's internal `act()` decisions. `info` is a good default for production.

## Test strategy

- **Unit tests**: Mock the `Stagehand` class. Verify each adapter calls `act()` / `extract()` with the expected prompts.
- **Smoke tests** (opt-in): Set `RUN_INTEGRATION_TESTS=1` + real credentials. Each platform has a smoke flow: login → fetch own profile → post test content → delete.

Don't run smoke tests on shared accounts — automated post/delete cycles can trigger anti-spam.

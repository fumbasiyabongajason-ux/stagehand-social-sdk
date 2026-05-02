# stagehand-social-sdk

> An open-source SDK for **logging into and acting on any website** — with first-class support for Instagram, TikTok, X, Facebook, YouTube, LinkedIn, and Threads.

Built on top of [Stagehand](https://github.com/browserbase/stagehand) (Browserbase's AI-powered browser automation framework). Available in **TypeScript** and **Python**.

---

## What it does

Two API tiers, one unified SDK:

### 1. Specialized social-platform adapters
Typed, opinionated wrappers for the 7 most-used social platforms. Each exposes the same contract:

```ts
const ig = sdk.platforms.instagram;
await ig.login();
await ig.post({ text: "Hello world", media: ["./photo.jpg"] });
await ig.comment({ url: "https://instagram.com/p/...", text: "Nice!" });
await ig.like({ url: "https://instagram.com/p/..." });
await ig.follow({ username: "someone" });
```

Supported platforms in v0.1.0:
- Instagram · TikTok · X (Twitter) · Facebook · YouTube · LinkedIn · Threads

### 2. `GenericSite` adapter — works on any website
Skip the platform shortcuts and drive any website with Stagehand's natural-language primitives:

```ts
const site = sdk.generic({
  baseUrl: "https://news.ycombinator.com",
  account: "myaccount",
});
await site.login({
  loginUrl: "/login",
  usernameField: "the username field",
  passwordField: "the password field",
  submit: "the login button",
});
await site.act("Click the upvote arrow on the third story");
const data = await site.extract({
  instruction: "Get the titles and points of the top 5 stories",
  schema: { titles: "string[]", points: "number[]" },
});
```

Use it for Reddit, Hacker News, your bank, your CRM, your dashboard — anywhere.

---

## Why Stagehand?

Selectors break. Stagehand's `act()` and `extract()` use a vision + DOM + LLM combination, so the SDK survives most UI redesigns. When Instagram moves a button, you don't ship a hotfix — Stagehand re-finds it.

---

## Install

### TypeScript / Node
```bash
npm install @stagehand-social/sdk
# or
pnpm add @stagehand-social/sdk
```

### Python
```bash
pip install stagehand-social
```

---

## Quickstart (TypeScript)

```ts
import { SocialSDK } from "@stagehand-social/sdk";

const sdk = await SocialSDK.create({
  browserbase: {
    apiKey: process.env.BROWSERBASE_API_KEY!,
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
  },
  llm: { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY! },
});

const ig = sdk.platforms.instagram;
await ig.login(); // reads STAGEHAND_SOCIAL_INSTAGRAM_USERNAME / _PASSWORD
await ig.post({ text: "First post from the SDK", media: ["./hello.jpg"] });

await sdk.close();
```

## Quickstart (Python)

```python
from stagehand_social import SocialSDK

sdk = await SocialSDK.create(
    browserbase={"api_key": os.environ["BROWSERBASE_API_KEY"],
                 "project_id": os.environ["BROWSERBASE_PROJECT_ID"]},
    llm={"provider": "anthropic", "api_key": os.environ["ANTHROPIC_API_KEY"]},
)

ig = sdk.platforms.instagram
await ig.login()
await ig.post(text="First post from the SDK", media=["./hello.jpg"])
await sdk.close()
```

---

## Environment variables

Copy `.env.example` to `.env` and fill in only the platforms you actually use:

```bash
# Required
BROWSERBASE_API_KEY=
BROWSERBASE_PROJECT_ID=
ANTHROPIC_API_KEY=                # or OPENAI_API_KEY

# Per-platform (only set what you need)
STAGEHAND_SOCIAL_INSTAGRAM_USERNAME=
STAGEHAND_SOCIAL_INSTAGRAM_PASSWORD=
STAGEHAND_SOCIAL_INSTAGRAM_TOTP_SECRET=    # optional, for 2FA

STAGEHAND_SOCIAL_TIKTOK_USERNAME=
STAGEHAND_SOCIAL_TIKTOK_PASSWORD=
# ... etc for x, facebook, youtube, linkedin, threads
```

---

## Sessions persist across runs

The SDK stores a Browserbase **context** per `(target, account)` pair. After your first successful `login()`, cookies are saved server-side and reused on every subsequent run — no re-authentication, no captcha re-prompts in most cases.

```ts
const ig = sdk.platforms.instagram; // first run: full login flow
await ig.login();

// next run, same machine or different — pulls the saved context
const ig2 = sdk.platforms.instagram;
await ig2.isLoggedIn(); // → true
```

---

## Multi-factor auth

Three options, in order of preference:

1. **TOTP secret** — set `STAGEHAND_SOCIAL_<PLATFORM>_TOTP_SECRET` and the SDK auto-fills 6-digit codes.
2. **Challenge callback** — pass `onMfaChallenge: async (challenge) => promptUser()` at `SocialSDK.create()` time. Called when the platform asks for an SMS / email / authenticator code.
3. **Persistent context** — log in manually once via Browserbase Live View; the cookie sticks, no MFA re-prompt for ~30 days on most platforms.

---

## Intended use

This SDK is for:
- Automating **your own** accounts (scheduling, cross-posting, light moderation)
- Accessibility tooling (screen-reader-friendly post composers, voice-driven posting)
- Internal tools that interact with platforms lacking proper APIs
- Testing your own apps that integrate with these platforms
- Research with proper IRB / ethics approval

This SDK is **not** for:
- Spam, fake engagement, or astroturfing
- Mass scraping or PII harvesting
- Operating accounts that don't belong to you
- Anything that violates a platform's Terms of Service

You are responsible for compliance with each platform's ToS. The maintainers ship this as a tool; how you use it is on you.

---

## Architecture

See [`docs/architecture.md`](docs/architecture.md). Short version:

```
SocialSDK (factory)
├── platforms.<name>      ← 7 typed adapters extending BasePlatform
└── generic({ baseUrl })  ← raw Stagehand act/extract/navigate

BasePlatform (abstract contract)
├── login / isLoggedIn / logout
├── post / comment / like / unlike
└── follow / unfollow

GenericSiteAdapter (concrete)
├── act(instruction)
├── extract({ instruction, schema })
├── navigate(url)
└── login({ loginUrl, usernameField, passwordField, submit })
```

Each adapter is ~200–400 lines of TypeScript wrapping Stagehand `act()` calls — readable, hackable, easy to fork.

---

## Project layout

```
stagehand-social-sdk/
├── packages/
│   ├── typescript/   ← @stagehand-social/sdk (npm-ready)
│   └── python/       ← stagehand-social (PyPI-ready)
├── docs/
│   ├── getting-started.md
│   ├── architecture.md
│   ├── generic.md
│   └── platforms/{instagram,tiktok,x,facebook,youtube,linkedin,threads}.md
└── .github/workflows/
    ├── ci-typescript.yml
    └── ci-python.yml
```

---

## Roadmap

- **v0.1.0** (this release) — Foundation, 7 platform adapters in TS, GenericSite, basic Python port
- **v0.2** — Full Python parity, scheduling helpers, post-status polling
- **v0.3** — Reddit + Discord adapters, DM support across platforms
- **v0.4** — Bulk-action helpers (queue + retry), webhooks for engagement events

---

## Contributing

PRs welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

When platforms inevitably redesign their UI, the fix is usually a one-line tweak to the natural-language prompt in the affected adapter. Stagehand handles the rest.

---

## License

MIT — see [`LICENSE`](LICENSE).

Stagehand is © Browserbase, also MIT.

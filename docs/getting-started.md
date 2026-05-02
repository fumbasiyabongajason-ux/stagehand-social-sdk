# Getting Started

This guide walks through your first end-to-end run with `stagehand-social-sdk` — install, configure credentials, and post to one platform.

## Prerequisites

| What | Why | How |
| --- | --- | --- |
| Browserbase account | Manages persistent browser sessions | https://browserbase.com |
| LLM API key | Powers Stagehand's natural-language `act()` | https://console.anthropic.com or https://platform.openai.com |
| Node 20+ **or** Python 3.10+ | Runtime | nvm / pyenv |
| A test social account | Your daily-driver account is **not** safe — automation flags happen | Create a fresh account on the platform you'll automate |

## 1. Install

### TypeScript
```bash
npm install @stagehand-social/sdk
```

### Python
```bash
pip install stagehand-social
```

## 2. Configure environment

Copy the example env file and fill in only what you need:

```bash
cp .env.example .env
```

The minimum for any run:

```bash
BROWSERBASE_API_KEY=bb_live_...
BROWSERBASE_PROJECT_ID=prj_...
ANTHROPIC_API_KEY=sk-ant-...        # or OPENAI_API_KEY
```

Then add credentials for the platform(s) you want to use:

```bash
STAGEHAND_SOCIAL_INSTAGRAM_USERNAME=yourtestaccount
STAGEHAND_SOCIAL_INSTAGRAM_PASSWORD=hunter2
STAGEHAND_SOCIAL_INSTAGRAM_TOTP_SECRET=JBSWY3DPEHPK3PXP    # optional, if you have 2FA
```

## 3. First run (TypeScript)

```ts
import "dotenv/config";
import { SocialSDK } from "@stagehand-social/sdk";

const sdk = await SocialSDK.create({
  browserbase: {
    apiKey: process.env.BROWSERBASE_API_KEY!,
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
  },
  llm: { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY! },
  headless: false,   // see what's happening on first run
});

const ig = sdk.platforms.instagram;
await ig.login();
console.log("Logged in:", await ig.isLoggedIn());

await ig.post({
  text: "Hello from the SDK 👋",
  media: ["./hello.jpg"],
  hashtags: ["sdk", "test"],
});

await sdk.close();
```

Run it:

```bash
npx tsx examples/quickstart.ts
```

## 4. First run (Python)

```python
import asyncio, os
from dotenv import load_dotenv
from stagehand_social import (
    SocialSDK, SocialSDKConfig, BrowserbaseConfig, LLMConfig, PostInput,
)

load_dotenv()

async def main():
    sdk = await SocialSDK.create(SocialSDKConfig(
        browserbase=BrowserbaseConfig(
            api_key=os.environ["BROWSERBASE_API_KEY"],
            project_id=os.environ["BROWSERBASE_PROJECT_ID"],
        ),
        llm=LLMConfig(provider="anthropic", api_key=os.environ["ANTHROPIC_API_KEY"]),
        headless=False,
    ))
    ig = sdk.platforms.instagram
    await ig.login()
    await ig.post(PostInput(
        text="Hello from the SDK 👋",
        media=["./hello.jpg"],
        hashtags=["sdk", "test"],
    ))
    await sdk.close()

asyncio.run(main())
```

## 5. What just happened

1. `SocialSDK.create()` initialized a `SessionManager` that talks to Browserbase.
2. `sdk.platforms.instagram` lazily built an `InstagramAdapter` — no Stagehand session yet.
3. `ig.login()` created a fresh Browserbase **context** (one-time), opened a Stagehand session against it, drove the login flow with natural-language `act()` calls, and persisted the context ID to `~/.stagehand-social/sessions.json`.
4. On your **next** run, `ig.login()` will short-circuit if the cookie is still valid — no re-auth needed.
5. `ig.post()` reused the open session, opened the composer, uploaded media, typed the caption, clicked Share.
6. `sdk.close()` tore down the Stagehand session. The Browserbase context persists for next time.

## 6. Next steps

- **Multi-platform**: see [`examples/multi-platform.ts`](../packages/typescript/examples/multi-platform.ts) for cross-posting.
- **Any website**: see [`docs/generic.md`](generic.md) and the HN example.
- **Production**: see [`docs/architecture.md`](architecture.md) for retry, rate-limit, and error-handling strategies.
- **Each platform's quirks**: see [`docs/platforms/`](platforms/).

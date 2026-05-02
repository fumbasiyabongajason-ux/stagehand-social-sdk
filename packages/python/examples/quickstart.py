"""Quickstart — log in to Instagram and publish a post.

Usage:
  1. Copy ../../.env.example to .env at the repo root, fill in keys.
  2. From the repo root:
       cd packages/python && pip install -e .
       python examples/quickstart.py
"""

from __future__ import annotations

import asyncio
import os

from dotenv import load_dotenv

from stagehand_social import (
    BrowserbaseConfig,
    LLMConfig,
    PostInput,
    SocialSDK,
    SocialSDKConfig,
)


async def main() -> None:
    load_dotenv()
    sdk = await SocialSDK.create(
        SocialSDKConfig(
            browserbase=BrowserbaseConfig(
                api_key=os.environ["BROWSERBASE_API_KEY"],
                project_id=os.environ["BROWSERBASE_PROJECT_ID"],
            ),
            llm=LLMConfig(
                provider="anthropic",
                api_key=os.environ["ANTHROPIC_API_KEY"],
            ),
            headless=False,
        )
    )

    ig = sdk.platforms.instagram

    print("Logging in…")
    await ig.login()

    print("Posting…")
    await ig.post(
        PostInput(
            text="Hello from stagehand-social-sdk!",
            media=["./examples/sample.jpg"],
            hashtags=["sdk", "automation"],
        )
    )

    print("Done.")
    await sdk.close()


if __name__ == "__main__":
    asyncio.run(main())

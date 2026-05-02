"""Generic-site example — log into Hacker News and upvote a story.

Demonstrates the GenericSiteAdapter for any website that doesn't have a
specialized platform adapter.
"""

from __future__ import annotations

import asyncio
import os

from dotenv import load_dotenv

from stagehand_social import (
    BrowserbaseConfig,
    GenericLoginInput,
    LLMConfig,
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

    # Reads STAGEHAND_SOCIAL_GENERIC_HN_USERNAME / _PASSWORD.
    hn = sdk.generic(site_id="hn", base_url="https://news.ycombinator.com")

    await hn.login(
        GenericLoginInput(
            login_url="/login",
            username_field="the username field",
            password_field="the password field",
            submit="the login button",
        )
    )

    print("Logged in to HN. Extracting top stories…")
    data = await hn.extract(
        instruction="Get the title and points of the top 5 stories on the front page",
        schema={"stories": "array of { title: string, points: number }"},
    )
    print(data)

    # Upvote the third story.
    await hn.act("Click the upvote arrow on the third story in the list")

    await sdk.close()


if __name__ == "__main__":
    asyncio.run(main())

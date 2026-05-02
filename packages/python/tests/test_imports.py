"""Smoke test — module imports + factory validation."""

from __future__ import annotations

import pytest

from stagehand_social import (
    BrowserbaseConfig,
    FacebookAdapter,
    GenericSiteAdapter,
    InstagramAdapter,
    LinkedInAdapter,
    LLMConfig,
    SocialSDK,
    SocialSDKConfig,
    ThreadsAdapter,
    TikTokAdapter,
    XAdapter,
    YouTubeAdapter,
)
from stagehand_social.core.errors import ConfigError


def test_adapters_exported() -> None:
    for cls in (
        InstagramAdapter,
        TikTokAdapter,
        XAdapter,
        FacebookAdapter,
        YouTubeAdapter,
        LinkedInAdapter,
        ThreadsAdapter,
        GenericSiteAdapter,
    ):
        assert cls is not None


@pytest.mark.asyncio
async def test_create_requires_keys() -> None:
    with pytest.raises(ConfigError):
        await SocialSDK.create(
            SocialSDKConfig(
                browserbase=BrowserbaseConfig(api_key="", project_id=""),
                llm=LLMConfig(provider="anthropic", api_key="x"),
            )
        )

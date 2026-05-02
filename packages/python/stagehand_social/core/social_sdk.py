"""SocialSDK factory — mirror of packages/typescript/src/core/SocialSDK.ts."""

from __future__ import annotations

from typing import Optional

from stagehand_social.core.base_platform import BasePlatform
from stagehand_social.core.errors import ConfigError
from stagehand_social.core.session import SessionManager
from stagehand_social.core.types import PlatformName, SocialSDKConfig
from stagehand_social.generic.generic_site import GenericSiteAdapter


class SocialSDK:
    """Top-level factory for platform adapters and the generic-site adapter."""

    default_account: str = "default"

    def __init__(
        self,
        config: SocialSDKConfig,
        session_manager: SessionManager,
    ):
        self._config = config
        self._session_manager = session_manager
        self._adapter_cache: dict[str, BasePlatform] = {}
        self._generic_cache: dict[str, GenericSiteAdapter] = {}

    @classmethod
    async def create(cls, config: SocialSDKConfig) -> "SocialSDK":
        if not config.browserbase.api_key or not config.browserbase.project_id:
            raise ConfigError("browserbase.api_key and browserbase.project_id are required")
        if not config.llm.api_key:
            raise ConfigError("llm.api_key is required")

        session_manager = SessionManager(
            api_key=config.browserbase.api_key,
            project_id=config.browserbase.project_id,
            session_dir=config.session_dir,
        )
        return cls(config, session_manager)

    @property
    def platforms(self) -> "_PlatformAccess":
        return _PlatformAccess(self)

    def platform(self, name: PlatformName, account: Optional[str] = None) -> BasePlatform:
        acct = account or self.default_account
        key = f"{name}::{acct}"
        if key in self._adapter_cache:
            return self._adapter_cache[key]

        # Lazy import to avoid loading all adapters every time.
        if name == "instagram":
            from stagehand_social.platforms.instagram import InstagramAdapter as Ctor
        elif name == "tiktok":
            from stagehand_social.platforms.tiktok import TikTokAdapter as Ctor
        elif name == "x":
            from stagehand_social.platforms.x import XAdapter as Ctor
        elif name == "facebook":
            from stagehand_social.platforms.facebook import FacebookAdapter as Ctor
        elif name == "youtube":
            from stagehand_social.platforms.youtube import YouTubeAdapter as Ctor
        elif name == "linkedin":
            from stagehand_social.platforms.linkedin import LinkedInAdapter as Ctor
        elif name == "threads":
            from stagehand_social.platforms.threads import ThreadsAdapter as Ctor
        else:
            raise ConfigError(f"Unknown platform: {name}")

        adapter = Ctor(
            platform=name,
            account=acct,
            session_manager=self._session_manager,
            on_mfa_challenge=self._config.on_mfa_challenge,
            llm=self._config.llm,
            headless=self._config.headless,
            log_level=self._config.log_level,
        )
        self._adapter_cache[key] = adapter
        return adapter

    def generic(
        self,
        site_id: str,
        base_url: str,
        account: Optional[str] = None,
    ) -> GenericSiteAdapter:
        acct = account or self.default_account
        key = f"generic:{site_id}::{acct}"
        if key in self._generic_cache:
            return self._generic_cache[key]
        generic = GenericSiteAdapter(
            site_id=site_id,
            base_url=base_url,
            account=acct,
            session_manager=self._session_manager,
            on_mfa_challenge=self._config.on_mfa_challenge,
            llm=self._config.llm,
            headless=self._config.headless,
            log_level=self._config.log_level,
        )
        self._generic_cache[key] = generic
        return generic

    async def close(self) -> None:
        import asyncio

        coros: list = []
        for adapter in self._adapter_cache.values():
            coros.append(adapter.close())
        for generic in self._generic_cache.values():
            coros.append(generic.close())
        if coros:
            await asyncio.gather(*coros, return_exceptions=True)
        self._adapter_cache.clear()
        self._generic_cache.clear()


class _PlatformAccess:
    """Convenience accessor: sdk.platforms.instagram etc."""

    def __init__(self, sdk: SocialSDK):
        self._sdk = sdk

    @property
    def instagram(self) -> BasePlatform:
        return self._sdk.platform("instagram")

    @property
    def tiktok(self) -> BasePlatform:
        return self._sdk.platform("tiktok")

    @property
    def x(self) -> BasePlatform:
        return self._sdk.platform("x")

    @property
    def facebook(self) -> BasePlatform:
        return self._sdk.platform("facebook")

    @property
    def youtube(self) -> BasePlatform:
        return self._sdk.platform("youtube")

    @property
    def linkedin(self) -> BasePlatform:
        return self._sdk.platform("linkedin")

    @property
    def threads(self) -> BasePlatform:
        return self._sdk.platform("threads")

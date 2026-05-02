"""Abstract BasePlatform — mirror of packages/typescript/src/core/BasePlatform.ts."""

from __future__ import annotations

import os
import time
from abc import ABC, abstractmethod
from typing import Optional

from stagehand import Stagehand, StagehandConfig

from stagehand_social.core.errors import AuthenticationError, ConfigError
from stagehand_social.core.session import SessionManager
from stagehand_social.core.types import (
    CommentInput,
    CommentResult,
    Credentials,
    FollowInput,
    FollowResult,
    LikeInput,
    LikeResult,
    LLMConfig,
    MfaCallback,
    PlatformName,
    PlatformTarget,
    PostInput,
    PostResult,
)


class BasePlatform(ABC):
    """Abstract base class for specialized platform adapters."""

    def __init__(
        self,
        platform: PlatformName,
        account: str,
        session_manager: SessionManager,
        llm: LLMConfig,
        credentials: Optional[Credentials] = None,
        on_mfa_challenge: Optional[MfaCallback] = None,
        headless: bool = True,
        log_level: str = "info",
    ):
        self.platform: PlatformName = platform
        self.account = account
        self.session_manager = session_manager
        self.credentials = credentials
        self.on_mfa_challenge = on_mfa_challenge
        self.llm_config = llm
        self.headless = headless
        self.log_level = log_level
        self._stagehand: Optional[Stagehand] = None

    # ------------------------------------------------------------------------
    # Subclass contract
    # ------------------------------------------------------------------------

    @abstractmethod
    def login_url(self) -> str: ...

    @abstractmethod
    async def perform_login(self, creds: Credentials) -> None: ...

    @abstractmethod
    async def is_logged_in(self) -> bool: ...

    @abstractmethod
    async def post(self, input: PostInput) -> PostResult: ...

    @abstractmethod
    async def comment(self, input: CommentInput) -> CommentResult: ...

    @abstractmethod
    async def like(self, input: LikeInput) -> LikeResult: ...

    @abstractmethod
    async def unlike(self, input: LikeInput) -> LikeResult: ...

    @abstractmethod
    async def follow(self, input: FollowInput) -> FollowResult: ...

    @abstractmethod
    async def unfollow(self, input: FollowInput) -> FollowResult: ...

    # ------------------------------------------------------------------------
    # Shared concrete methods
    # ------------------------------------------------------------------------

    async def get_stagehand(self) -> Stagehand:
        if self._stagehand is not None:
            return self._stagehand
        target = PlatformTarget(platform=self.platform)
        context_id = self.session_manager.get_or_create_context(target, self.account)
        session_params = self.session_manager.build_session_params(context_id)

        config = StagehandConfig(
            env="BROWSERBASE",
            project_id=session_params["project_id"],
            browserbase_session_create_params=session_params,
            model_name=self.llm_config.model,
            model_client_options={"apiKey": self.llm_config.api_key},
            verbose=2 if self.log_level == "debug" else (1 if self.log_level == "info" else 0),
            headless=self.headless,
        )
        self._stagehand = Stagehand(config)
        await self._stagehand.init()
        return self._stagehand

    async def login(self, creds: Optional[Credentials] = None) -> None:
        resolved = creds or self.credentials or self._load_creds_from_env()
        if resolved is None:
            raise ConfigError(
                f"No credentials for {self.platform}. Set "
                f"STAGEHAND_SOCIAL_{self.platform.upper()}_USERNAME / _PASSWORD "
                "or pass them to login()."
            )
        self.credentials = resolved
        await self.get_stagehand()

        try:
            already = await self.is_logged_in()
        except Exception:
            already = False
        if already:
            self.session_manager.mark_verified(PlatformTarget(platform=self.platform), self.account)
            return

        sh = await self.get_stagehand()
        await sh.page.goto(self.login_url())
        await self.perform_login(resolved)

        if not await self.is_logged_in():
            raise AuthenticationError(
                f"{self.platform} login appeared to succeed but is_logged_in() returned False."
            )
        self.session_manager.mark_verified(PlatformTarget(platform=self.platform), self.account)

    async def close(self) -> None:
        if self._stagehand is None:
            return
        try:
            await self._stagehand.close()
        finally:
            self._stagehand = None

    async def logout(self) -> None:
        sh = await self.get_stagehand()
        try:
            await sh.page.act("Open the user menu and click 'Log out'")
        finally:
            self.session_manager.forget(PlatformTarget(platform=self.platform), self.account)
            await self.close()

    # ------------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------------

    def _load_creds_from_env(self) -> Optional[Credentials]:
        prefix = f"STAGEHAND_SOCIAL_{self.platform.upper()}"
        username = os.environ.get(f"{prefix}_USERNAME")
        password = os.environ.get(f"{prefix}_PASSWORD")
        totp_secret = os.environ.get(f"{prefix}_TOTP_SECRET")
        if not username or not password:
            return None
        return Credentials(username=username, password=password, totp_secret=totp_secret)

    def _now(self) -> int:
        return int(time.time() * 1000)

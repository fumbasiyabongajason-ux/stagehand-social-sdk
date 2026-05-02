"""GenericSiteAdapter — mirror of packages/typescript/src/generic/GenericSiteAdapter.ts."""

from __future__ import annotations

import os
from typing import Any, Optional, TypeVar

from stagehand import Stagehand, StagehandConfig

from stagehand_social.core.errors import (
    AuthenticationError,
    ConfigError,
    SocialSDKError,
)
from stagehand_social.core.mfa import resolve_mfa
from stagehand_social.core.session import SessionManager
from stagehand_social.core.types import (
    Credentials,
    GenericLoginInput,
    GenericTarget,
    LLMConfig,
    MfaCallback,
    MfaChallenge,
)

T = TypeVar("T")


class GenericSiteAdapter:
    """Drive any website with Stagehand's natural-language primitives."""

    def __init__(
        self,
        site_id: str,
        base_url: str,
        session_manager: SessionManager,
        llm: LLMConfig,
        account: str = "default",
        credentials: Optional[Credentials] = None,
        on_mfa_challenge: Optional[MfaCallback] = None,
        headless: bool = True,
        log_level: str = "info",
    ):
        self.site_id = site_id
        self.base_url = base_url.rstrip("/")
        self.account = account
        self.session_manager = session_manager
        self.credentials = credentials
        self.on_mfa_challenge = on_mfa_challenge
        self.llm_config = llm
        self.headless = headless
        self.log_level = log_level
        self._stagehand: Optional[Stagehand] = None

    # ------------------------------------------------------------------------
    # Stagehand lifecycle
    # ------------------------------------------------------------------------

    async def get_stagehand(self) -> Stagehand:
        if self._stagehand is not None:
            return self._stagehand
        target = GenericTarget(site_id=self.site_id)
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

    async def close(self) -> None:
        if self._stagehand is None:
            return
        try:
            await self._stagehand.close()
        finally:
            self._stagehand = None

    # ------------------------------------------------------------------------
    # Public primitives
    # ------------------------------------------------------------------------

    async def navigate(self, url: str) -> None:
        sh = await self.get_stagehand()
        target = url if url.startswith("http") else f"{self.base_url}{url if url.startswith('/') else '/' + url}"
        await sh.page.goto(target)

    async def act(self, instruction: str) -> None:
        sh = await self.get_stagehand()
        await sh.page.act(instruction)

    async def extract(self, instruction: str, schema: Optional[Any] = None) -> Any:
        sh = await self.get_stagehand()
        kwargs: dict = {"instruction": instruction}
        if schema is not None:
            kwargs["schema"] = schema
        return await sh.page.extract(**kwargs)

    async def observe(self, instruction: Optional[str] = None) -> Any:
        sh = await self.get_stagehand()
        return await sh.page.observe(instruction or "What can I do on this page?")

    # ------------------------------------------------------------------------
    # Generic login flow
    # ------------------------------------------------------------------------

    async def login(self, input: GenericLoginInput) -> None:
        creds = input.credentials or self.credentials or self._load_creds_from_env()
        if creds is None:
            raise ConfigError(
                f"No credentials for generic site '{self.site_id}'. Set "
                f"STAGEHAND_SOCIAL_GENERIC_{self.site_id.upper()}_USERNAME and _PASSWORD, "
                "or pass credentials to login()."
            )
        self.credentials = creds

        await self.navigate(input.login_url)

        user_field = input.username_field or "the username or email field"
        pass_field = input.password_field or "the password field"
        submit_btn = input.submit or "the sign in / log in button"

        if input.has_username:
            await self.act(f'Type "{creds.username}" into {user_field}')
        await self.act(f'Type "{creds.password}" into {pass_field}')
        await self.act(f"Click {submit_btn}")

        sh = await self.get_stagehand()
        try:
            await sh.page.wait_for_load_state("networkidle")
        except Exception:
            pass

        # Best-effort MFA detection.
        try:
            mfa_resp = await self.extract(
                instruction=(
                    "Is the page asking for a verification / 2FA / authenticator code? "
                    "Return mfaVisible=true or false and any visible hint."
                ),
                schema={"mfaVisible": "boolean", "hint": "string"},
            )
        except Exception:
            mfa_resp = {"mfaVisible": False}

        if isinstance(mfa_resp, dict) and mfa_resp.get("mfaVisible"):
            code = await resolve_mfa(
                MfaChallenge(
                    description=f"Site requested 2FA code (hint: {mfa_resp.get('hint', '')})",
                    channel="unknown",
                    hint=mfa_resp.get("hint"),
                ),
                creds,
                self.on_mfa_challenge,
            )
            await self.act(f'Type "{code}" into the verification code field')
            await self.act("Click the verify / submit button")
            try:
                await sh.page.wait_for_load_state("networkidle")
            except Exception:
                pass

        # Best-effort verification.
        try:
            verified = await self.extract(
                instruction=(
                    "Look for any signal that the user is now logged in (avatar, "
                    "username displayed, account dropdown, 'Logout' link). Return "
                    "loggedIn=true or false."
                ),
                schema={"loggedIn": "boolean"},
            )
        except Exception:
            verified = {"loggedIn": False}

        if not (isinstance(verified, dict) and verified.get("loggedIn")):
            raise AuthenticationError(
                f"Generic login on '{self.site_id}' could not be verified. "
                "Check credentials or pass more specific field selectors."
            )

        self.session_manager.mark_verified(GenericTarget(site_id=self.site_id), self.account)

    async def is_logged_in(self) -> bool:
        try:
            r = await self.extract(
                instruction=(
                    "Is there any visible indicator that the user is logged in (avatar, "
                    "username, account menu, Logout link)? Return loggedIn=true or false."
                ),
                schema={"loggedIn": "boolean"},
            )
            return bool(isinstance(r, dict) and r.get("loggedIn"))
        except Exception as e:
            raise SocialSDKError(f"Could not determine login state for '{self.site_id}'", e) from e

    # ------------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------------

    def _load_creds_from_env(self) -> Optional[Credentials]:
        prefix = f"STAGEHAND_SOCIAL_GENERIC_{self.site_id.upper()}"
        username = os.environ.get(f"{prefix}_USERNAME")
        password = os.environ.get(f"{prefix}_PASSWORD")
        totp_secret = os.environ.get(f"{prefix}_TOTP_SECRET")
        if not username or not password:
            return None
        return Credentials(username=username, password=password, totp_secret=totp_secret)

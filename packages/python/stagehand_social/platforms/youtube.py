"""YouTube adapter — Python mirror of platforms/youtube.ts.

v0.1: login (Google), comment, like, subscribe. No uploads.
"""

from __future__ import annotations

import json

from stagehand_social.core.base_platform import BasePlatform
from stagehand_social.core.mfa import resolve_mfa
from stagehand_social.core.types import (
    CommentInput,
    CommentResult,
    Credentials,
    FollowInput,
    FollowResult,
    LikeInput,
    LikeResult,
    MfaChallenge,
    PostInput,
    PostResult,
)


class YouTubeAdapter(BasePlatform):
    def login_url(self) -> str:
        return "https://accounts.google.com/ServiceLogin?service=youtube"

    async def perform_login(self, creds: Credentials) -> None:
        sh = await self.get_stagehand()
        await sh.page.act(f'Type "{creds.username}" into the email or phone field')
        await sh.page.act("Click Next")
        try:
            await sh.page.wait_for_load_state("networkidle")
        except Exception:
            pass

        await sh.page.act(f'Type "{creds.password}" into the password field')
        await sh.page.act("Click Next")
        try:
            await sh.page.wait_for_load_state("networkidle")
        except Exception:
            pass

        try:
            mfa = await sh.page.extract(
                instruction="Is Google asking for a 2-step verification code? Return mfa=true|false plus channel.",
                schema={"mfa": "boolean", "channel": "string"},
            )
        except Exception:
            mfa = {"mfa": False, "channel": "unknown"}
        if isinstance(mfa, dict) and mfa.get("mfa"):
            channel = mfa.get("channel") if mfa.get("channel") in ("sms", "email", "authenticator") else "unknown"
            code = await resolve_mfa(
                MfaChallenge(description="Google 2FA", channel=channel),
                creds,
                self.on_mfa_challenge,
            )
            await sh.page.act(f'Type "{code}" into the code field')
            await sh.page.act("Click Next or Verify")

        try:
            await sh.page.goto("https://www.youtube.com/")
        except Exception:
            pass

    async def is_logged_in(self) -> bool:
        sh = await self.get_stagehand()
        if "youtube.com" not in sh.page.url:
            try:
                await sh.page.goto("https://www.youtube.com/")
            except Exception:
                pass
        try:
            r = await sh.page.extract(
                instruction=(
                    "Is the user logged into YouTube? Look for a profile avatar in the top-right "
                    "instead of a 'Sign in' button. Return loggedIn=true|false."
                ),
                schema={"loggedIn": "boolean"},
            )
            return bool(isinstance(r, dict) and r.get("loggedIn"))
        except Exception:
            return False

    async def post(self, input: PostInput) -> PostResult:
        raise NotImplementedError(
            "YouTube uploads are not supported in v0.1. Use YouTube Studio directly, or wait for v0.2."
        )

    async def comment(self, input: CommentInput) -> CommentResult:
        sh = await self.get_stagehand()
        await sh.page.goto(input.url)
        await sh.page.act("Scroll down to the comments section")
        await sh.page.act("Click the 'Add a comment...' input field")
        await sh.page.act(f"Type the comment: {json.dumps(input.text)}")
        await sh.page.act("Click the 'Comment' button to submit")
        return CommentResult(success=True, at=self._now(), url=input.url)

    async def like(self, input: LikeInput) -> LikeResult:
        sh = await self.get_stagehand()
        await sh.page.goto(input.url)
        await sh.page.act("Click the thumbs-up Like button below the video player")
        return LikeResult(success=True, at=self._now(), url=input.url, liked=True)

    async def unlike(self, input: LikeInput) -> LikeResult:
        sh = await self.get_stagehand()
        await sh.page.goto(input.url)
        await sh.page.act("Click the (currently-active blue) thumbs-up Like button below the video player to remove the like")
        return LikeResult(success=True, at=self._now(), url=input.url, liked=False)

    async def follow(self, input: FollowInput) -> FollowResult:
        """Subscribe to a channel."""
        sh = await self.get_stagehand()
        handle = input.username if input.username.startswith("@") else f"@{input.username}"
        await sh.page.goto(f"https://www.youtube.com/{handle}")
        await sh.page.act("Click the 'Subscribe' button on the channel header")
        return FollowResult(success=True, at=self._now(), following=True)

    async def unfollow(self, input: FollowInput) -> FollowResult:
        sh = await self.get_stagehand()
        handle = input.username if input.username.startswith("@") else f"@{input.username}"
        await sh.page.goto(f"https://www.youtube.com/{handle}")
        await sh.page.act(
            "Click the 'Subscribed' button on the channel header, then click 'Unsubscribe' in the menu"
        )
        return FollowResult(success=True, at=self._now(), following=False)

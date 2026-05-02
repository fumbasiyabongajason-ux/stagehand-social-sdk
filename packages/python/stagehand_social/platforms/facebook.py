"""Facebook adapter — Python mirror of platforms/facebook.ts."""

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


class FacebookAdapter(BasePlatform):
    def login_url(self) -> str:
        return "https://www.facebook.com/login/"

    async def perform_login(self, creds: Credentials) -> None:
        sh = await self.get_stagehand()
        await sh.page.act(f'Type "{creds.username}" into the email or phone field')
        await sh.page.act(f'Type "{creds.password}" into the password field')
        await sh.page.act("Click the Log in button")
        try:
            await sh.page.wait_for_load_state("networkidle")
        except Exception:
            pass

        try:
            mfa = await sh.page.extract(
                instruction="Is Facebook asking for a 2FA / login code? Return mfa=true|false plus hint.",
                schema={"mfa": "boolean", "hint": "string"},
            )
        except Exception:
            mfa = {"mfa": False, "hint": ""}
        if isinstance(mfa, dict) and mfa.get("mfa"):
            code = await resolve_mfa(
                MfaChallenge(description="Facebook 2FA", channel="unknown", hint=mfa.get("hint")),
                creds,
                self.on_mfa_challenge,
            )
            await sh.page.act(f'Type "{code}" into the code field')
            await sh.page.act("Click Continue")

        try:
            await sh.page.act(
                "If a 'Trust this device?' or 'Save browser?' prompt appears, click Continue or Trust this device"
            )
        except Exception:
            pass

    async def is_logged_in(self) -> bool:
        sh = await self.get_stagehand()
        if "facebook.com" not in sh.page.url:
            try:
                await sh.page.goto("https://www.facebook.com/")
            except Exception:
                pass
        try:
            r = await sh.page.extract(
                instruction=(
                    "Is the user logged into Facebook? Look for the blue header bar with avatar "
                    "and a 'What's on your mind?' composer. Return loggedIn=true|false."
                ),
                schema={"loggedIn": "boolean"},
            )
            return bool(isinstance(r, dict) and r.get("loggedIn"))
        except Exception:
            return False

    async def post(self, input: PostInput) -> PostResult:
        sh = await self.get_stagehand()
        await sh.page.goto("https://www.facebook.com/")
        await sh.page.act("Click the 'What's on your mind?' composer at the top of the feed")

        if input.media:
            async with sh.page.expect_file_chooser() as fc_info:
                await sh.page.act("Click the 'Photo/video' button in the post dialog")
            chooser = await fc_info.value
            await chooser.set_files(input.media)

        if input.text:
            caption = self._compose_caption(input)
            await sh.page.act(f"Type the following into the post text area: {json.dumps(caption)}")

        await sh.page.act("Click the 'Post' button at the bottom of the dialog")
        return PostResult(success=True, at=self._now())

    def _compose_caption(self, input: PostInput) -> str:
        caption = input.text or ""
        if input.hashtags:
            caption += "\n\n" + " ".join(f"#{h.lstrip('#')}" for h in input.hashtags)
        return caption

    async def comment(self, input: CommentInput) -> CommentResult:
        sh = await self.get_stagehand()
        await sh.page.goto(input.url)
        await sh.page.act("Click the 'Write a comment...' input under the post")
        await sh.page.act(f"Type the comment: {json.dumps(input.text)}")
        await sh.page.act("Press Enter to submit the comment")
        return CommentResult(success=True, at=self._now(), url=input.url)

    async def like(self, input: LikeInput) -> LikeResult:
        sh = await self.get_stagehand()
        await sh.page.goto(input.url)
        await sh.page.act("Click the 'Like' button (thumbs up) under the post")
        return LikeResult(success=True, at=self._now(), url=input.url, liked=True)

    async def unlike(self, input: LikeInput) -> LikeResult:
        sh = await self.get_stagehand()
        await sh.page.goto(input.url)
        await sh.page.act("Click the (currently-active blue) Like button under the post to unlike it")
        return LikeResult(success=True, at=self._now(), url=input.url, liked=False)

    async def follow(self, input: FollowInput) -> FollowResult:
        sh = await self.get_stagehand()
        handle = input.username.lstrip("@")
        await sh.page.goto(f"https://www.facebook.com/{handle}")
        await sh.page.act(
            "Click the 'Follow' button on the profile header. If only 'Add Friend' is visible, click that."
        )
        return FollowResult(success=True, at=self._now(), following=True)

    async def unfollow(self, input: FollowInput) -> FollowResult:
        sh = await self.get_stagehand()
        handle = input.username.lstrip("@")
        await sh.page.goto(f"https://www.facebook.com/{handle}")
        await sh.page.act("Click the 'Following' button, then click 'Unfollow' in the menu")
        return FollowResult(success=True, at=self._now(), following=False)

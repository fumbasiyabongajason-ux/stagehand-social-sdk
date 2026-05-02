"""LinkedIn adapter — Python mirror of platforms/linkedin.ts."""

from __future__ import annotations

import json

from stagehand_social.core.base_platform import BasePlatform
from stagehand_social.core.errors import ChallengeError
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


class LinkedInAdapter(BasePlatform):
    def login_url(self) -> str:
        return "https://www.linkedin.com/login"

    async def perform_login(self, creds: Credentials) -> None:
        sh = await self.get_stagehand()
        await sh.page.act(f'Type "{creds.username}" into the email field')
        await sh.page.act(f'Type "{creds.password}" into the password field')
        await sh.page.act("Click the Sign in button")
        try:
            await sh.page.wait_for_load_state("networkidle")
        except Exception:
            pass

        try:
            challenge = await sh.page.extract(
                instruction=(
                    "Is LinkedIn showing a security checkpoint, captcha, or 'unusual login attempt' page? "
                    "Return blocked=true|false."
                ),
                schema={"blocked": "boolean"},
            )
        except Exception:
            challenge = {"blocked": False}
        if isinstance(challenge, dict) and challenge.get("blocked"):
            raise ChallengeError(
                "LinkedIn returned a security checkpoint. Solve it once via Browserbase Live View."
            )

        try:
            mfa = await sh.page.extract(
                instruction="Is LinkedIn asking for a verification code? Return mfa=true|false.",
                schema={"mfa": "boolean"},
            )
        except Exception:
            mfa = {"mfa": False}
        if isinstance(mfa, dict) and mfa.get("mfa"):
            code = await resolve_mfa(
                MfaChallenge(description="LinkedIn 2FA", channel="unknown"),
                creds,
                self.on_mfa_challenge,
            )
            await sh.page.act(f'Type "{code}" into the verification code field')
            await sh.page.act("Click Submit")

    async def is_logged_in(self) -> bool:
        sh = await self.get_stagehand()
        if "linkedin.com" not in sh.page.url:
            try:
                await sh.page.goto("https://www.linkedin.com/feed/")
            except Exception:
                pass
        try:
            r = await sh.page.extract(
                instruction=(
                    "Is the user logged into LinkedIn? Look for the top-nav 'Me' menu with a profile photo "
                    "or a 'Start a post' composer. Return loggedIn=true|false."
                ),
                schema={"loggedIn": "boolean"},
            )
            return bool(isinstance(r, dict) and r.get("loggedIn"))
        except Exception:
            return False

    async def post(self, input: PostInput) -> PostResult:
        sh = await self.get_stagehand()
        await sh.page.goto("https://www.linkedin.com/feed/")
        await sh.page.act("Click the 'Start a post' button at the top of the feed")

        if input.media:
            async with sh.page.expect_file_chooser() as fc_info:
                await sh.page.act("Click the 'Add a photo' or 'Add a video' button in the post composer dialog")
            chooser = await fc_info.value
            await chooser.set_files(input.media)
            try:
                await sh.page.act("Click 'Done' if a photo confirmation dialog is shown")
            except Exception:
                pass

        if input.text:
            caption = self._compose_caption(input)
            await sh.page.act(f"Type the following into the post body: {json.dumps(caption)}")

        await sh.page.act("Click the 'Post' button to publish")
        return PostResult(success=True, at=self._now())

    def _compose_caption(self, input: PostInput) -> str:
        caption = input.text or ""
        if input.hashtags:
            caption += "\n\n" + " ".join(f"#{h.lstrip('#')}" for h in input.hashtags)
        return caption

    async def comment(self, input: CommentInput) -> CommentResult:
        sh = await self.get_stagehand()
        await sh.page.goto(input.url)
        await sh.page.act("Click the 'Comment' button under the post to open the comment composer")
        await sh.page.act(f"Type the comment: {json.dumps(input.text)}")
        await sh.page.act("Click the 'Post' button next to the comment composer")
        return CommentResult(success=True, at=self._now(), url=input.url)

    async def like(self, input: LikeInput) -> LikeResult:
        sh = await self.get_stagehand()
        await sh.page.goto(input.url)
        await sh.page.act("Click the 'Like' button (thumbs-up) under the post")
        return LikeResult(success=True, at=self._now(), url=input.url, liked=True)

    async def unlike(self, input: LikeInput) -> LikeResult:
        sh = await self.get_stagehand()
        await sh.page.goto(input.url)
        await sh.page.act("Click the (currently-active) Like reaction under the post to remove it")
        return LikeResult(success=True, at=self._now(), url=input.url, liked=False)

    async def follow(self, input: FollowInput) -> FollowResult:
        sh = await self.get_stagehand()
        handle = input.username.lstrip("@").lstrip("in/")
        await sh.page.goto(f"https://www.linkedin.com/in/{handle}/")
        await sh.page.act(
            "Click the 'Follow' button on the profile header. "
            "If only 'Connect' is visible, click 'More' first and then 'Follow'."
        )
        return FollowResult(success=True, at=self._now(), following=True)

    async def unfollow(self, input: FollowInput) -> FollowResult:
        sh = await self.get_stagehand()
        handle = input.username.lstrip("@").lstrip("in/")
        await sh.page.goto(f"https://www.linkedin.com/in/{handle}/")
        await sh.page.act("Click 'More' on the profile header, then click 'Unfollow' in the dropdown")
        return FollowResult(success=True, at=self._now(), following=False)

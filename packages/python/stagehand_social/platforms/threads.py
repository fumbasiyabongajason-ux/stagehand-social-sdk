"""Threads adapter — Python mirror of platforms/threads.ts."""

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


class ThreadsAdapter(BasePlatform):
    def login_url(self) -> str:
        return "https://www.threads.net/login"

    async def perform_login(self, creds: Credentials) -> None:
        sh = await self.get_stagehand()
        try:
            await sh.page.act("Click 'Continue with Instagram' if visible")
        except Exception:
            pass
        try:
            await sh.page.wait_for_load_state("networkidle")
        except Exception:
            pass

        # If IG cookie carryover already logged us in, exit.
        try:
            already = await self.is_logged_in()
        except Exception:
            already = False
        if already:
            return

        await sh.page.act(f'Type "{creds.username}" into the username field')
        await sh.page.act(f'Type "{creds.password}" into the password field')
        await sh.page.act("Click the Log in button")
        try:
            await sh.page.wait_for_load_state("networkidle")
        except Exception:
            pass

        try:
            mfa = await sh.page.extract(
                instruction="Is Threads / Instagram asking for a 2FA code? Return mfa=true|false.",
                schema={"mfa": "boolean"},
            )
        except Exception:
            mfa = {"mfa": False}
        if isinstance(mfa, dict) and mfa.get("mfa"):
            code = await resolve_mfa(
                MfaChallenge(description="Threads 2FA (Instagram-backed)", channel="unknown"),
                creds,
                self.on_mfa_challenge,
            )
            await sh.page.act(f'Type "{code}" into the verification code field')
            await sh.page.act("Click Confirm")

    async def is_logged_in(self) -> bool:
        sh = await self.get_stagehand()
        if "threads.net" not in sh.page.url:
            try:
                await sh.page.goto("https://www.threads.net/")
            except Exception:
                pass
        try:
            r = await sh.page.extract(
                instruction=(
                    "Is the user logged into Threads? Look for a profile avatar, 'New thread' button, "
                    "or the home feed. Return loggedIn=true|false."
                ),
                schema={"loggedIn": "boolean"},
            )
            return bool(isinstance(r, dict) and r.get("loggedIn"))
        except Exception:
            return False

    async def post(self, input: PostInput) -> PostResult:
        sh = await self.get_stagehand()
        await sh.page.goto("https://www.threads.net/")
        await sh.page.act("Click the 'New thread' button (pencil icon) in the left sidebar or bottom nav")

        if input.media:
            async with sh.page.expect_file_chooser() as fc_info:
                await sh.page.act("Click the attach (paperclip / photo) button in the new-thread composer")
            chooser = await fc_info.value
            await chooser.set_files(input.media)

        if input.text:
            body = self._compose_caption(input)
            await sh.page.act(f"Type the following into the thread body: {json.dumps(body)}")

        await sh.page.act("Click the 'Post' button to publish the thread")
        return PostResult(success=True, at=self._now())

    def _compose_caption(self, input: PostInput) -> str:
        body = input.text or ""
        if input.mentions:
            body += " " + " ".join(f"@{m.lstrip('@')}" for m in input.mentions)
        if input.hashtags:
            body += " " + " ".join(f"#{h.lstrip('#')}" for h in input.hashtags)
        return body.strip()

    async def comment(self, input: CommentInput) -> CommentResult:
        sh = await self.get_stagehand()
        await sh.page.goto(input.url)
        await sh.page.act("Click the 'Reply' input under the thread")
        await sh.page.act(f"Type the reply: {json.dumps(input.text)}")
        await sh.page.act("Click the 'Post' button to submit the reply")
        return CommentResult(success=True, at=self._now(), url=input.url)

    async def like(self, input: LikeInput) -> LikeResult:
        sh = await self.get_stagehand()
        await sh.page.goto(input.url)
        await sh.page.act("Click the heart icon under the thread to like it")
        return LikeResult(success=True, at=self._now(), url=input.url, liked=True)

    async def unlike(self, input: LikeInput) -> LikeResult:
        sh = await self.get_stagehand()
        await sh.page.goto(input.url)
        await sh.page.act("Click the (already-filled red) heart icon under the thread to unlike it")
        return LikeResult(success=True, at=self._now(), url=input.url, liked=False)

    async def follow(self, input: FollowInput) -> FollowResult:
        sh = await self.get_stagehand()
        handle = input.username.lstrip("@")
        await sh.page.goto(f"https://www.threads.net/@{handle}")
        await sh.page.act("Click the 'Follow' button on the profile header")
        return FollowResult(success=True, at=self._now(), following=True)

    async def unfollow(self, input: FollowInput) -> FollowResult:
        sh = await self.get_stagehand()
        handle = input.username.lstrip("@")
        await sh.page.goto(f"https://www.threads.net/@{handle}")
        await sh.page.act("Click the 'Following' button on the profile header, then click 'Unfollow' in the dialog")
        return FollowResult(success=True, at=self._now(), following=False)

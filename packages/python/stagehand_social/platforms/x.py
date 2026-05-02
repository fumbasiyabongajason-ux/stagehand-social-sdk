"""X / Twitter adapter — Python mirror of platforms/x.ts."""

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


class XAdapter(BasePlatform):
    def login_url(self) -> str:
        return "https://x.com/i/flow/login"

    async def perform_login(self, creds: Credentials) -> None:
        sh = await self.get_stagehand()
        await sh.page.act(f'Type "{creds.username}" into the username field')
        await sh.page.act("Click the Next button")
        try:
            await sh.page.wait_for_load_state("networkidle")
        except Exception:
            pass

        try:
            verify_step = await sh.page.extract(
                instruction="Is the page asking to confirm email or phone before password? Return needsVerify=true|false.",
                schema={"needsVerify": "boolean"},
            )
        except Exception:
            verify_step = {"needsVerify": False}
        if isinstance(verify_step, dict) and verify_step.get("needsVerify"):
            await sh.page.act(f'Type "{creds.username}" into the email or phone confirmation field')
            await sh.page.act("Click Next")

        await sh.page.act(f'Type "{creds.password}" into the password field')
        await sh.page.act("Click the Log in button")
        try:
            await sh.page.wait_for_load_state("networkidle")
        except Exception:
            pass

        try:
            mfa = await sh.page.extract(
                instruction="Is X asking for a verification code? Return mfa=true|false plus channel and hint.",
                schema={"mfa": "boolean", "channel": "string", "hint": "string"},
            )
        except Exception:
            mfa = {"mfa": False, "channel": "unknown", "hint": ""}
        if isinstance(mfa, dict) and mfa.get("mfa"):
            channel = mfa.get("channel") if mfa.get("channel") in ("sms", "email", "authenticator") else "unknown"
            code = await resolve_mfa(
                MfaChallenge(
                    description="X requires verification code",
                    channel=channel,
                    hint=mfa.get("hint"),
                ),
                creds,
                self.on_mfa_challenge,
            )
            await sh.page.act(f'Type "{code}" into the verification code field')
            await sh.page.act("Click Next or Verify")

    async def is_logged_in(self) -> bool:
        sh = await self.get_stagehand()
        url = sh.page.url
        if "x.com" not in url and "twitter.com" not in url:
            try:
                await sh.page.goto("https://x.com/home")
            except Exception:
                pass
        try:
            r = await sh.page.extract(
                instruction="Is the user logged into X / Twitter? Look for 'Post' button or profile avatar. Return loggedIn=true|false.",
                schema={"loggedIn": "boolean"},
            )
            return bool(isinstance(r, dict) and r.get("loggedIn"))
        except Exception:
            return False

    async def post(self, input: PostInput) -> PostResult:
        sh = await self.get_stagehand()
        await sh.page.goto("https://x.com/home")
        await sh.page.act("Click the 'Post' button in the left sidebar to open the composer")

        if input.media:
            async with sh.page.expect_file_chooser() as fc_info:
                await sh.page.act("Click the media (image/video) attach button in the composer")
            chooser = await fc_info.value
            await chooser.set_files(input.media)

        body = self._compose_caption(input)
        if body:
            await sh.page.act(f"Type the following text into the post composer body: {json.dumps(body)}")

        await sh.page.act("Click the 'Post' button to publish the tweet")
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
        await sh.page.act("Click the reply button (speech bubble icon) below the tweet")
        await sh.page.act(f"Type the reply: {json.dumps(input.text)}")
        await sh.page.act("Click the 'Reply' button to submit")
        return CommentResult(success=True, at=self._now(), url=input.url)

    async def like(self, input: LikeInput) -> LikeResult:
        sh = await self.get_stagehand()
        await sh.page.goto(input.url)
        await sh.page.act("Click the heart icon below the tweet to like it")
        return LikeResult(success=True, at=self._now(), url=input.url, liked=True)

    async def unlike(self, input: LikeInput) -> LikeResult:
        sh = await self.get_stagehand()
        await sh.page.goto(input.url)
        await sh.page.act("Click the (already-filled red) heart icon below the tweet to unlike it")
        return LikeResult(success=True, at=self._now(), url=input.url, liked=False)

    async def follow(self, input: FollowInput) -> FollowResult:
        sh = await self.get_stagehand()
        handle = input.username.lstrip("@")
        await sh.page.goto(f"https://x.com/{handle}")
        await sh.page.act("Click the Follow button on the profile header")
        return FollowResult(success=True, at=self._now(), following=True)

    async def unfollow(self, input: FollowInput) -> FollowResult:
        sh = await self.get_stagehand()
        handle = input.username.lstrip("@")
        await sh.page.goto(f"https://x.com/{handle}")
        await sh.page.act("Click the 'Following' button on the profile header")
        await sh.page.act("Click 'Unfollow' in the confirmation dialog")
        return FollowResult(success=True, at=self._now(), following=False)

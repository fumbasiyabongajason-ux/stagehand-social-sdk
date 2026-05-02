"""TikTok adapter — Python mirror of platforms/tiktok.ts."""

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


class TikTokAdapter(BasePlatform):
    def login_url(self) -> str:
        return "https://www.tiktok.com/login/phone-or-email/email"

    async def perform_login(self, creds: Credentials) -> None:
        sh = await self.get_stagehand()
        await sh.page.act(f'Type "{creds.username}" into the email or username field')
        await sh.page.act(f'Type "{creds.password}" into the password field')
        await sh.page.act("Click the Log in button")
        try:
            await sh.page.wait_for_load_state("networkidle")
        except Exception:
            pass

        try:
            captcha = await sh.page.extract(
                instruction="Is a captcha (slider, puzzle, or 'verify you are human') visible? Return captcha=true|false.",
                schema={"captcha": "boolean"},
            )
        except Exception:
            captcha = {"captcha": False}
        if isinstance(captcha, dict) and captcha.get("captcha"):
            raise ChallengeError(
                "TikTok showed a captcha. Solve it once via Browserbase Live View, "
                "or enable captcha-solving on your Browserbase project."
            )

        try:
            mfa = await sh.page.extract(
                instruction="Is TikTok asking for a verification code? Return mfa=true|false plus hint.",
                schema={"mfa": "boolean", "hint": "string"},
            )
        except Exception:
            mfa = {"mfa": False, "hint": ""}
        if isinstance(mfa, dict) and mfa.get("mfa"):
            code = await resolve_mfa(
                MfaChallenge(description="TikTok 2FA", channel="unknown", hint=mfa.get("hint")),
                creds,
                self.on_mfa_challenge,
            )
            await sh.page.act(f'Type "{code}" into the verification code field')
            await sh.page.act("Click the Verify button")

    async def is_logged_in(self) -> bool:
        sh = await self.get_stagehand()
        if "tiktok.com" not in sh.page.url:
            try:
                await sh.page.goto("https://www.tiktok.com/")
            except Exception:
                pass
        try:
            r = await sh.page.extract(
                instruction=(
                    "Is the user logged into TikTok? Look for profile avatar, Inbox icon, "
                    "or Upload button. Return loggedIn=true|false."
                ),
                schema={"loggedIn": "boolean"},
            )
            return bool(isinstance(r, dict) and r.get("loggedIn"))
        except Exception:
            return False

    async def post(self, input: PostInput) -> PostResult:
        sh = await self.get_stagehand()
        if not input.media:
            raise ValueError("TikTok requires a video file")
        await sh.page.goto("https://www.tiktok.com/upload")
        async with sh.page.expect_file_chooser() as fc_info:
            await sh.page.act("Click the 'Select video' upload button")
        chooser = await fc_info.value
        await chooser.set_files([input.media[0]])

        if input.text:
            caption = self._compose_caption(input)
            await sh.page.act(f"Clear the caption field, then type: {json.dumps(caption)}")

        await sh.page.act("Click the 'Post' button to publish")
        return PostResult(success=True, at=self._now())

    def _compose_caption(self, input: PostInput) -> str:
        caption = input.text or ""
        if input.mentions:
            caption += " " + " ".join(f"@{m.lstrip('@')}" for m in input.mentions)
        if input.hashtags:
            caption += " " + " ".join(f"#{h.lstrip('#')}" for h in input.hashtags)
        return caption.strip()

    async def comment(self, input: CommentInput) -> CommentResult:
        sh = await self.get_stagehand()
        await sh.page.goto(input.url)
        await sh.page.act("Open the comments panel by clicking the speech-bubble icon if it isn't already open")
        await sh.page.act("Click the comment input field at the bottom of the comments panel")
        await sh.page.act(f"Type the comment: {json.dumps(input.text)}")
        await sh.page.act("Click the send / post button next to the comment input")
        return CommentResult(success=True, at=self._now(), url=input.url)

    async def like(self, input: LikeInput) -> LikeResult:
        sh = await self.get_stagehand()
        await sh.page.goto(input.url)
        await sh.page.act("Click the heart icon next to the video to like it")
        return LikeResult(success=True, at=self._now(), url=input.url, liked=True)

    async def unlike(self, input: LikeInput) -> LikeResult:
        sh = await self.get_stagehand()
        await sh.page.goto(input.url)
        await sh.page.act("Click the (already-filled red) heart icon next to the video to unlike it")
        return LikeResult(success=True, at=self._now(), url=input.url, liked=False)

    async def follow(self, input: FollowInput) -> FollowResult:
        sh = await self.get_stagehand()
        handle = input.username.lstrip("@")
        await sh.page.goto(f"https://www.tiktok.com/@{handle}")
        await sh.page.act("Click the Follow button on the profile header")
        return FollowResult(success=True, at=self._now(), following=True)

    async def unfollow(self, input: FollowInput) -> FollowResult:
        sh = await self.get_stagehand()
        handle = input.username.lstrip("@")
        await sh.page.goto(f"https://www.tiktok.com/@{handle}")
        await sh.page.act(
            "Click the 'Following' button on the profile header, then confirm 'Unfollow' in the dialog"
        )
        return FollowResult(success=True, at=self._now(), following=False)

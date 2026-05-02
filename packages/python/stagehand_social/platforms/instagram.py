"""Instagram adapter — Python mirror of platforms/instagram.ts."""

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


class InstagramAdapter(BasePlatform):
    def login_url(self) -> str:
        return "https://www.instagram.com/accounts/login/"

    async def perform_login(self, creds: Credentials) -> None:
        sh = await self.get_stagehand()
        await sh.page.act(f'Type "{creds.username}" into the username / phone / email field')
        await sh.page.act(f'Type "{creds.password}" into the password field')
        await sh.page.act("Click the Log in button")
        try:
            await sh.page.wait_for_load_state("networkidle")
        except Exception:
            pass

        try:
            mfa = await sh.page.extract(
                instruction=(
                    "Is Instagram asking for a 2FA / verification code? Return mfa=true|false "
                    "plus channel ('sms'|'email'|'authenticator'|'unknown') and any visible hint."
                ),
                schema={"mfa": "boolean", "channel": "string", "hint": "string"},
            )
        except Exception:
            mfa = {"mfa": False, "channel": "unknown", "hint": ""}

        if isinstance(mfa, dict) and mfa.get("mfa"):
            channel = mfa.get("channel") if mfa.get("channel") in ("sms", "email", "authenticator") else "unknown"
            code = await resolve_mfa(
                MfaChallenge(
                    description="Instagram requires a 2FA code",
                    channel=channel,
                    hint=mfa.get("hint"),
                ),
                creds,
                self.on_mfa_challenge,
            )
            await sh.page.act(f'Type "{code}" into the verification code field')
            await sh.page.act("Click Confirm")
            try:
                await sh.page.wait_for_load_state("networkidle")
            except Exception:
                pass

        try:
            blocked = await sh.page.extract(
                instruction=(
                    "Is the page blocked by a captcha, 'suspicious activity', or 'we detected unusual login attempts'? Return blocked=true|false."
                ),
                schema={"blocked": "boolean"},
            )
        except Exception:
            blocked = {"blocked": False}
        if isinstance(blocked, dict) and blocked.get("blocked"):
            raise ChallengeError(
                "Instagram blocked the login with a security challenge. Try logging in via Browserbase Live View once to clear it."
            )

        for _ in range(2):
            try:
                await sh.page.act(
                    "If a dialog asks 'Save your login info?', click 'Not now'. "
                    "If a dialog asks 'Turn on notifications?', click 'Not Now'."
                )
            except Exception:
                pass

    async def is_logged_in(self) -> bool:
        sh = await self.get_stagehand()
        if "instagram.com" not in sh.page.url:
            try:
                await sh.page.goto("https://www.instagram.com/")
            except Exception:
                pass
        try:
            r = await sh.page.extract(
                instruction=(
                    "Is the user logged into Instagram? Look for a profile avatar or 'Create' button. Return loggedIn=true|false."
                ),
                schema={"loggedIn": "boolean"},
            )
            return bool(isinstance(r, dict) and r.get("loggedIn"))
        except Exception:
            return False

    async def post(self, input: PostInput) -> PostResult:
        sh = await self.get_stagehand()
        if not input.media:
            raise ValueError("Instagram requires at least one media file")
        await sh.page.goto("https://www.instagram.com/")
        await sh.page.act("Click the 'Create' button in the left sidebar, then click 'Post'")

        async with sh.page.expect_file_chooser() as fc_info:
            await sh.page.act("Click the 'Select from computer' button")
        chooser = await fc_info.value
        await chooser.set_files(input.media)

        await sh.page.act("Click the 'Next' button to advance past the crop step")
        await sh.page.act("Click the 'Next' button to advance past the edit step")

        if input.text:
            caption = self._compose_caption(input)
            await sh.page.act(f"Type the following caption into the caption field: {json.dumps(caption)}")
        if input.location:
            await sh.page.act(
                f'Click "Add location" and type "{input.location}", then click the first suggestion'
            )

        await sh.page.act("Click the 'Share' button to publish the post")
        try:
            await sh.page.wait_for_load_state("networkidle")
        except Exception:
            pass
        return PostResult(success=True, at=self._now())

    def _compose_caption(self, input: PostInput) -> str:
        caption = input.text or ""
        if input.mentions:
            caption += "\n\n" + " ".join(f"@{m.lstrip('@')}" for m in input.mentions)
        if input.hashtags:
            caption += "\n\n" + " ".join(f"#{h.lstrip('#')}" for h in input.hashtags)
        return caption

    async def comment(self, input: CommentInput) -> CommentResult:
        sh = await self.get_stagehand()
        await sh.page.goto(input.url)
        await sh.page.act("Click the comment input field at the bottom of the post")
        await sh.page.act(f"Type the comment: {json.dumps(input.text)}")
        await sh.page.act("Click the 'Post' button to submit the comment")
        return CommentResult(success=True, at=self._now(), url=input.url)

    async def like(self, input: LikeInput) -> LikeResult:
        sh = await self.get_stagehand()
        await sh.page.goto(input.url)
        await sh.page.act("Click the heart icon under the post to like it")
        return LikeResult(success=True, at=self._now(), url=input.url, liked=True)

    async def unlike(self, input: LikeInput) -> LikeResult:
        sh = await self.get_stagehand()
        await sh.page.goto(input.url)
        await sh.page.act("Click the (already-filled red) heart icon under the post to unlike it")
        return LikeResult(success=True, at=self._now(), url=input.url, liked=False)

    async def follow(self, input: FollowInput) -> FollowResult:
        sh = await self.get_stagehand()
        handle = input.username.lstrip("@")
        await sh.page.goto(f"https://www.instagram.com/{handle}/")
        await sh.page.act("Click the 'Follow' button on the profile header")
        return FollowResult(success=True, at=self._now(), following=True)

    async def unfollow(self, input: FollowInput) -> FollowResult:
        sh = await self.get_stagehand()
        handle = input.username.lstrip("@")
        await sh.page.goto(f"https://www.instagram.com/{handle}/")
        await sh.page.act("Click the 'Following' button on the profile header")
        await sh.page.act("In the dialog that appears, click 'Unfollow'")
        return FollowResult(success=True, at=self._now(), following=False)

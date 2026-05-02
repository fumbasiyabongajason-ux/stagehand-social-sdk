# TikTok

## Quirks

- **Captcha-heavy**: TikTok shows captchas on most fresh sessions. Enable Browserbase's captcha-solver, or solve once via Live View. The SDK throws `ChallengeError` if it detects an unsolved captcha.
- **Web upload only**: this adapter uses `tiktok.com/upload`, not the mobile app. Web uploads support the same caption / hashtag / privacy options.
- **Video only**: TikTok web doesn't accept still images. Pass an `.mp4` or `.mov` to `media: [...]`.
- **Long uploads**: large files take 30–120s. The SDK waits up to 2 minutes for the post button to enable.

## Credentials

```bash
STAGEHAND_SOCIAL_TIKTOK_USERNAME=yourhandle
STAGEHAND_SOCIAL_TIKTOK_PASSWORD=hunter2
STAGEHAND_SOCIAL_TIKTOK_TOTP_SECRET=...    # optional
```

## Action coverage

| Action | Supported |
| --- | --- |
| `login()` | ✅ |
| `post()` | ✅ (video only) |
| `comment()` | ✅ |
| `like()` / `unlike()` | ✅ |
| `follow()` / `unfollow()` | ✅ |

# YouTube

## Quirks

- **Google login**: this is a regular Google account login. If the same Google account is already signed in (Gmail, Drive) on the Browserbase context, login short-circuits.
- **Uploads not in v0.1**: video uploads require Studio's drag-drop flow with extensive metadata forms. Planned for v0.2.
- **"Follow" maps to "Subscribe"**: YouTube's analog to follow.

## Credentials

```bash
STAGEHAND_SOCIAL_YOUTUBE_USERNAME=email@gmail.com
STAGEHAND_SOCIAL_YOUTUBE_PASSWORD=hunter2
STAGEHAND_SOCIAL_YOUTUBE_TOTP_SECRET=...    # optional
```

## Action coverage

| Action | Supported | Notes |
| --- | --- | --- |
| `login()` | ✅ | Google account login |
| `post()` | ❌ | Throws — uploads come in v0.2 |
| `comment()` | ✅ | |
| `like()` / `unlike()` | ✅ | |
| `follow()` / `unfollow()` | ✅ | = Subscribe / Unsubscribe |

# X (Twitter)

## Quirks

- **Multi-step login**: enter username → potentially confirm email/phone → enter password. The adapter handles all three steps automatically.
- **API tier-locked**: the official X API requires a paid tier (~$100/month) for posting. This SDK uses the **web** UI, so no API tier is needed.
- **Threaded replies**: `comment()` posts a reply to the URL you pass.

## Credentials

```bash
STAGEHAND_SOCIAL_X_USERNAME=yourhandle
STAGEHAND_SOCIAL_X_PASSWORD=hunter2
STAGEHAND_SOCIAL_X_TOTP_SECRET=...    # optional
```

## Action coverage

| Action | Supported | Notes |
| --- | --- | --- |
| `login()` | ✅ | Handles email/phone confirmation step |
| `post()` | ✅ | Up to 4 media files |
| `comment()` | ✅ | Maps to "Reply" |
| `like()` / `unlike()` | ✅ | |
| `follow()` / `unfollow()` | ✅ | |

# Facebook

## Quirks

- **Strict fingerprint detection**: new sessions on residential IPs work best. Browserbase residential proxies recommended.
- **"Trust this device?" prompts**: dismissed automatically.
- **Profile vs Page posting**: the SDK posts to the logged-in user's personal feed by default. For Page posting, use `GenericSiteAdapter` against the Page composer URL.

## Credentials

```bash
STAGEHAND_SOCIAL_FACEBOOK_USERNAME=email@example.com
STAGEHAND_SOCIAL_FACEBOOK_PASSWORD=hunter2
STAGEHAND_SOCIAL_FACEBOOK_TOTP_SECRET=...    # optional
```

## Action coverage

| Action | Supported | Notes |
| --- | --- | --- |
| `login()` | ✅ | |
| `post()` | ✅ | Default visibility = whatever the account default is |
| `comment()` | ✅ | |
| `like()` / `unlike()` | ✅ | |
| `follow()` / `unfollow()` | ✅ | Falls back to "Add Friend" if Follow isn't available |

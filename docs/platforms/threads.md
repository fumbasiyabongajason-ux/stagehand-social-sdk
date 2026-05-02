# Threads

## Quirks

- **Linked to Instagram**: Threads is an Instagram product. Login uses Instagram credentials. If the IG context for the same `account` is already authenticated, Threads short-circuits via cookie carryover.
- **Same MFA secret**: if you use TOTP on Instagram, the same secret works for Threads.

## Credentials

```bash
STAGEHAND_SOCIAL_THREADS_USERNAME=yourighandle
STAGEHAND_SOCIAL_THREADS_PASSWORD=hunter2     # same as IG
STAGEHAND_SOCIAL_THREADS_TOTP_SECRET=...      # same as IG
```

(Tip: many users just symlink the env vars: `STAGEHAND_SOCIAL_THREADS_PASSWORD=$STAGEHAND_SOCIAL_INSTAGRAM_PASSWORD`.)

## Action coverage

| Action | Supported |
| --- | --- |
| `login()` | ✅ |
| `post()` | ✅ |
| `comment()` | ✅ (= Reply) |
| `like()` / `unlike()` | ✅ |
| `follow()` / `unfollow()` | ✅ |

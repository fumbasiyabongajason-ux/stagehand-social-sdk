# LinkedIn

## Quirks

- **"Unusual login attempt"**: LinkedIn flags many fresh logins. Solve once via Browserbase Live View; the cookie sticks.
- **Connect vs Follow**: not every profile shows a "Follow" button. The adapter falls back to clicking "More → Follow" if the primary "Follow" isn't visible.

## Credentials

```bash
STAGEHAND_SOCIAL_LINKEDIN_USERNAME=email@example.com
STAGEHAND_SOCIAL_LINKEDIN_PASSWORD=hunter2
STAGEHAND_SOCIAL_LINKEDIN_TOTP_SECRET=...    # optional
```

## Action coverage

| Action | Supported |
| --- | --- |
| `login()` | ✅ |
| `post()` | ✅ |
| `comment()` | ✅ |
| `like()` / `unlike()` | ✅ |
| `follow()` / `unfollow()` | ✅ |

## Rate-limit guidance

LinkedIn aggressively rate-limits new accounts. Keep first-week activity under 10 actions per day to avoid restrictions.

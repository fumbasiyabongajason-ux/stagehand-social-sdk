# Instagram

## Quirks

- **Web composer required**: this adapter uses the web composer at `instagram.com`, not the mobile app. All actions go through the same UI a user would see in Chrome.
- **Suspicious activity walls**: new sessions sometimes get a "suspicious activity" prompt. Solve it once via Browserbase Live View; the cookie sticks.
- **"Save your login info?" / "Turn on notifications?" prompts**: dismissed automatically by `performLogin()`.
- **Reels**: pass an `.mp4` to `media: [...]`. Instagram detects it as a reel automatically.
- **Carousels**: pass multiple files in `media: [...]`. Instagram builds the carousel for you.

## Credentials

```bash
STAGEHAND_SOCIAL_INSTAGRAM_USERNAME=yourhandle
STAGEHAND_SOCIAL_INSTAGRAM_PASSWORD=hunter2
STAGEHAND_SOCIAL_INSTAGRAM_TOTP_SECRET=JBSWY3DPEHPK3PXP    # optional, if 2FA enabled
```

## Action coverage

| Action | Supported | Notes |
| --- | --- | --- |
| `login()` | ✅ | Auto-handles 2FA via TOTP or callback |
| `post()` | ✅ | Image, carousel, reel via media file extension |
| `comment()` | ✅ | Top-level comments only in v0.1 |
| `like()` / `unlike()` | ✅ | Pass post URL |
| `follow()` / `unfollow()` | ✅ | Pass username (no `@` needed) |

## Rate-limit guidance

Instagram's silent shadowban thresholds (April 2026, observed):

- New accounts: ≤ 5 posts / day, ≤ 20 likes / hour, ≤ 30 follows / day for the first 14 days.
- Established accounts: ≤ 20 posts / day, ≤ 60 likes / hour, ≤ 150 follows / day.

These are heuristics, not Instagram-published numbers. The SDK does **not** enforce them — that's on you.

## Example

```ts
const ig = sdk.platforms.instagram;
await ig.login();

// Carousel post
await ig.post({
  text: "Three of my favorite shots from this week.",
  media: ["./img1.jpg", "./img2.jpg", "./img3.jpg"],
  hashtags: ["photography", "weeklyfavorites"],
  location: "Brooklyn, New York",
});

// Comment + like
await ig.comment({
  url: "https://www.instagram.com/p/CrZ5...",
  text: "🔥",
});
await ig.like({ url: "https://www.instagram.com/p/CrZ5..." });

// Follow
await ig.follow({ username: "natgeo" });
```

## Known issues

- Instagram occasionally A/B tests new composer flows. If `post()` fails with `ElementNotFoundError`, open an issue with a screenshot of the composer you saw.
- The SDK does not currently support tagging products or branded content disclosures. Planned for v0.2.

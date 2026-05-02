# Using `GenericSiteAdapter`

The 7 specialized platform adapters cover the common cases. For everything else — your bank, your CRM, Reddit, Hacker News, an internal admin panel — use `GenericSiteAdapter`.

## When to use it

| You want to… | Use |
| --- | --- |
| Post on Instagram | `sdk.platforms.instagram` |
| Post on Reddit | `sdk.generic({ siteId: "reddit", baseUrl: "https://reddit.com" })` |
| Read your bank balance | `sdk.generic({ siteId: "mybank", baseUrl: "https://bank.com" })` |
| Drive your internal dashboard | `sdk.generic({ siteId: "admin", baseUrl: "https://admin.mycompany.com" })` |

## API

```ts
const site = sdk.generic({
  siteId: "reddit",                     // unique key for env vars + session storage
  baseUrl: "https://www.reddit.com",
  account: "myaccount",                 // optional, default "default"
});

// Navigation
await site.navigate("/r/programming");

// Take an action by description
await site.act("Click the upvote arrow on the third post");

// Pull structured data off the page
const data = await site.extract<{ posts: { title: string; upvotes: number }[] }>({
  instruction: "Get the title and upvote count of the top 5 posts",
  schema: { posts: "array of { title: string, upvotes: number }" },
});

// Ask what's possible (debugging / planning)
const options = await site.observe("What buttons are visible on this page?");

// Driven login
await site.login({
  loginUrl: "/login",
  usernameField: "the username field",
  passwordField: "the password field",
  submit: "the login button",
});

// Check session
console.log(await site.isLoggedIn());

await site.close();
```

## Credentials

Pulled from env in this order:

```
STAGEHAND_SOCIAL_GENERIC_<SITEID>_USERNAME
STAGEHAND_SOCIAL_GENERIC_<SITEID>_PASSWORD
STAGEHAND_SOCIAL_GENERIC_<SITEID>_TOTP_SECRET    # optional
```

E.g. for `siteId: "reddit"`:

```bash
STAGEHAND_SOCIAL_GENERIC_REDDIT_USERNAME=myuser
STAGEHAND_SOCIAL_GENERIC_REDDIT_PASSWORD=hunter2
```

You can also pass `credentials` directly in `login()` to bypass env vars.

## Sessions

Just like specialized adapters, `GenericSiteAdapter` reuses Browserbase contexts across runs. The session key is `generic:<siteId>::<account>`, so e.g. `siteId: "reddit", account: "default"` and `account: "alt"` get separate contexts.

## Tips

1. **Be specific in `act()` prompts.** "Click the upvote arrow on the third story" beats "Click upvote".
2. **Use `observe()` to debug.** When `act()` fails, run `observe()` to see what Stagehand sees.
3. **Pass schemas to `extract()`** for typed results — Stagehand returns better-structured data when it knows what you want.
4. **Login is best-effort.** If a site has a unusual login flow (multi-factor, weird redirects), pass more specific field descriptions to `login()`, or break it into manual `act()` calls.

## Example: Reddit

```ts
const reddit = sdk.generic({
  siteId: "reddit",
  baseUrl: "https://www.reddit.com",
});

await reddit.login({
  loginUrl: "/login",
  usernameField: "the username input",
  passwordField: "the password input",
  submit: "the Log In button",
});

await reddit.navigate("/r/javascript");
await reddit.act("Click the 'Create Post' button at the top of the subreddit");
await reddit.act("Type 'My new project' as the post title");
await reddit.act("Type a longer description in the post body");
await reddit.act("Click 'Post' to submit");
```

## Example: Read-only data extraction

```ts
const espn = sdk.generic({
  siteId: "espn",
  baseUrl: "https://www.espn.com",
});

await espn.navigate("/nba/scoreboard");
const games = await espn.extract<{ games: { home: string; away: string; score: string }[] }>({
  instruction: "Get every NBA game on the page with home team, away team, and score",
});
console.log(games);
```

No login needed for public data — just navigate and extract.

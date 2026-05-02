/**
 * Generic-site example — log into Hacker News and upvote a story.
 *
 * Demonstrates the GenericSiteAdapter for any website that doesn't have a
 * specialized platform adapter.
 */

import "dotenv/config";
import { SocialSDK } from "@stagehand-social/sdk";

async function main() {
  const sdk = await SocialSDK.create({
    browserbase: {
      apiKey: process.env.BROWSERBASE_API_KEY!,
      projectId: process.env.BROWSERBASE_PROJECT_ID!,
    },
    llm: { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY! },
    headless: false,
  });

  // Use STAGEHAND_SOCIAL_GENERIC_HN_USERNAME / _PASSWORD from env.
  const hn = sdk.generic({
    siteId: "hn",
    baseUrl: "https://news.ycombinator.com",
  });

  await hn.login({
    loginUrl: "/login",
    usernameField: "the username field",
    passwordField: "the password field",
    submit: "the login button",
  });

  console.log("Logged in to HN. Extracting top stories…");
  const data = await hn.extract<{ stories: { title: string; points: number }[] }>({
    instruction: "Get the title and points of the top 5 stories on the front page",
    schema: { stories: "array of { title: string, points: number }" },
  });
  console.log(data);

  // Upvote the third story (illustrative — your karma may not allow it).
  await hn.act("Click the upvote arrow on the third story in the list");

  await sdk.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

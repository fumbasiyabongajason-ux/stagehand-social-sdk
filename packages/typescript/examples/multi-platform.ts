/**
 * Multi-platform example — cross-post the same content to X, Threads, and LinkedIn.
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
  });

  const text = "Just shipped v0.1 of stagehand-social-sdk — log in & act on any website with one API.";
  const hashtags = ["stagehand", "automation"];

  // Run all three logins in parallel (independent Browserbase contexts).
  await Promise.all([
    sdk.platforms.x.login(),
    sdk.platforms.threads.login(),
    sdk.platforms.linkedin.login(),
  ]);

  // Post sequentially so failures are easy to attribute.
  await sdk.platforms.x.post({ text, hashtags });
  await sdk.platforms.threads.post({ text, hashtags });
  await sdk.platforms.linkedin.post({ text, hashtags });

  await sdk.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

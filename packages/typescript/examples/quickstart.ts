/**
 * Quickstart — log in to Instagram and publish a post.
 *
 * Usage:
 *   1. Copy ../../.env.example to .env at the repo root, fill in
 *      BROWSERBASE_*, ANTHROPIC_API_KEY, and STAGEHAND_SOCIAL_INSTAGRAM_*.
 *   2. From the repo root: npx tsx packages/typescript/examples/quickstart.ts
 */

import "dotenv/config";
import { SocialSDK } from "@stagehand-social/sdk";

async function main() {
  const sdk = await SocialSDK.create({
    browserbase: {
      apiKey: process.env.BROWSERBASE_API_KEY!,
      projectId: process.env.BROWSERBASE_PROJECT_ID!,
    },
    llm: {
      provider: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY!,
    },
    headless: false, // flip to true for CI
  });

  const ig = sdk.platforms.instagram;

  console.log("Logging in…");
  await ig.login();

  console.log("Posting…");
  await ig.post({
    text: "Hello from stagehand-social-sdk!",
    media: ["./examples/sample.jpg"],
    hashtags: ["sdk", "automation"],
  });

  console.log("Done.");
  await sdk.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

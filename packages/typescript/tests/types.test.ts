/**
 * Smoke test — type compilation only. Real integration tests live behind the
 * RUN_INTEGRATION_TESTS env flag (not run in CI by default).
 */
import { describe, it, expect } from "vitest";
import {
  SocialSDK,
  InstagramAdapter,
  TikTokAdapter,
  XAdapter,
  FacebookAdapter,
  YouTubeAdapter,
  LinkedInAdapter,
  ThreadsAdapter,
  GenericSiteAdapter,
} from "../src/index.js";

describe("module exports", () => {
  it("exports SocialSDK and all adapters", () => {
    expect(SocialSDK).toBeDefined();
    expect(InstagramAdapter).toBeDefined();
    expect(TikTokAdapter).toBeDefined();
    expect(XAdapter).toBeDefined();
    expect(FacebookAdapter).toBeDefined();
    expect(YouTubeAdapter).toBeDefined();
    expect(LinkedInAdapter).toBeDefined();
    expect(ThreadsAdapter).toBeDefined();
    expect(GenericSiteAdapter).toBeDefined();
  });

  it("SocialSDK.create requires browserbase config", async () => {
    await expect(
      SocialSDK.create({
        // @ts-expect-error — intentionally missing
        browserbase: {},
        llm: { provider: "anthropic", apiKey: "x" },
      }),
    ).rejects.toThrow(/browserbase\.apiKey/);
  });
});

/**
 * YouTube adapter.
 *
 * v0.1 covers: login (Google), comment, like, subscribe.
 * Video uploads are NOT in v0.1 (require Studio's drag-drop flow; planned v0.2+).
 *
 * Notes:
 *   - Login is Google-account-wide. If the same Google account is signed in
 *     for Gmail / Drive / etc., this adapter simply navigates to youtube.com
 *     and confirms.
 *   - "Follow" is mapped to "subscribe" (YouTube's term).
 */

import { BasePlatform } from "../core/BasePlatform.js";
import { resolveMfa } from "../core/mfa.js";
import type {
  CommentInput,
  CommentResult,
  Credentials,
  FollowInput,
  FollowResult,
  LikeInput,
  LikeResult,
  PostInput,
  PostResult,
} from "../core/types.js";

export class YouTubeAdapter extends BasePlatform {
  protected loginUrl(): string {
    return "https://accounts.google.com/ServiceLogin?service=youtube";
  }

  protected async performLogin(creds: Credentials): Promise<void> {
    const sh = await this.getStagehand();
    await sh.page.act(`Type "${creds.username}" into the email or phone field`);
    await sh.page.act("Click Next");
    await sh.page.waitForLoadState("networkidle").catch(() => {});

    await sh.page.act(`Type "${creds.password}" into the password field`);
    await sh.page.act("Click Next");
    await sh.page.waitForLoadState("networkidle").catch(() => {});

    const mfa = await sh.page.extract({
      instruction: "Is Google asking for a 2-step verification code? Return mfa=true|false plus channel.",
      schema: { mfa: "boolean", channel: "string" },
    }).catch(() => ({ mfa: false, channel: "unknown" as const }));
    const m = mfa as { mfa: boolean; channel: string };
    if (m.mfa) {
      const code = await resolveMfa(
        {
          description: "Google 2FA",
          channel: (["sms", "email", "authenticator"].includes(m.channel)
            ? m.channel
            : "unknown") as "sms" | "email" | "authenticator" | "unknown",
        },
        creds,
        this.onMfaChallenge,
      );
      await sh.page.act(`Type "${code}" into the code field`);
      await sh.page.act("Click Next or Verify");
      await sh.page.waitForLoadState("networkidle").catch(() => {});
    }

    // Land on YouTube to confirm cookie carryover.
    await sh.page.goto("https://www.youtube.com/").catch(() => {});
  }

  async isLoggedIn(): Promise<boolean> {
    const sh = await this.getStagehand();
    if (!sh.page.url().includes("youtube.com")) {
      await sh.page.goto("https://www.youtube.com/").catch(() => {});
    }
    const r = await sh.page.extract({
      instruction:
        "Is the user logged into YouTube? Look for a profile avatar (account circle) in the top-right corner instead of a 'Sign in' button. Return loggedIn=true|false.",
      schema: { loggedIn: "boolean" },
    }).catch(() => ({ loggedIn: false }));
    return Boolean((r as { loggedIn: boolean }).loggedIn);
  }

  async post(_input: PostInput): Promise<PostResult> {
    throw new Error(
      "YouTube uploads are not supported in v0.1. Use YouTube Studio directly, or wait for v0.2.",
    );
  }

  async comment(input: CommentInput): Promise<CommentResult> {
    const sh = await this.getStagehand();
    await sh.page.goto(input.url);
    await sh.page.act("Scroll down to the comments section");
    await sh.page.act("Click the 'Add a comment...' input field");
    await sh.page.act(`Type the comment: ${JSON.stringify(input.text)}`);
    await sh.page.act("Click the 'Comment' button to submit");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url };
  }

  async like(input: LikeInput): Promise<LikeResult> {
    const sh = await this.getStagehand();
    await sh.page.goto(input.url);
    await sh.page.act("Click the thumbs-up Like button below the video player");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url, liked: true };
  }

  async unlike(input: LikeInput): Promise<LikeResult> {
    const sh = await this.getStagehand();
    await sh.page.goto(input.url);
    await sh.page.act("Click the (currently-active blue) thumbs-up Like button below the video player to remove the like");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url, liked: false };
  }

  /** Subscribe to a channel. `username` may be a handle (@channel) or channel ID. */
  async follow(input: FollowInput): Promise<FollowResult> {
    const sh = await this.getStagehand();
    const handle = input.username.startsWith("@") ? input.username : `@${input.username}`;
    await sh.page.goto(`https://www.youtube.com/${handle}`);
    await sh.page.act("Click the 'Subscribe' button on the channel header");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), following: true };
  }

  async unfollow(input: FollowInput): Promise<FollowResult> {
    const sh = await this.getStagehand();
    const handle = input.username.startsWith("@") ? input.username : `@${input.username}`;
    await sh.page.goto(`https://www.youtube.com/${handle}`);
    await sh.page.act("Click the 'Subscribed' button on the channel header, then click 'Unsubscribe' in the menu");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), following: false };
  }
}

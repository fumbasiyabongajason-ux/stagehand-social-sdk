/**
 * Facebook adapter.
 *
 * Notes:
 *   - Uses facebook.com (NOT m.facebook.com) for the rich composer.
 *   - Heavy fingerprint detection; recommend Browserbase residential proxies
 *     and a warm-up period for new accounts.
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

export class FacebookAdapter extends BasePlatform {
  protected loginUrl(): string {
    return "https://www.facebook.com/login/";
  }

  protected async performLogin(creds: Credentials): Promise<void> {
    const sh = await this.getStagehand();
    await sh.page.act(`Type "${creds.username}" into the email or phone field`);
    await sh.page.act(`Type "${creds.password}" into the password field`);
    await sh.page.act("Click the Log in button");
    await sh.page.waitForLoadState("networkidle").catch(() => {});

    const mfa = await sh.page.extract({
      instruction: "Is Facebook asking for a 2FA / login code? Return mfa=true|false plus hint.",
      schema: { mfa: "boolean", hint: "string" },
    }).catch(() => ({ mfa: false, hint: "" }));
    const m = mfa as { mfa: boolean; hint?: string };
    if (m.mfa) {
      const code = await resolveMfa(
        { description: "Facebook 2FA", channel: "unknown", hint: m.hint },
        creds,
        this.onMfaChallenge,
      );
      await sh.page.act(`Type "${code}" into the code field`);
      await sh.page.act("Click Continue");
      await sh.page.waitForLoadState("networkidle").catch(() => {});
    }

    // Dismiss "Trust this device?" / "Save browser?" prompts.
    await sh.page.act("If a 'Trust this device?' or 'Save browser?' prompt appears, click Continue or Trust this device").catch(() => undefined);
  }

  async isLoggedIn(): Promise<boolean> {
    const sh = await this.getStagehand();
    if (!sh.page.url().includes("facebook.com")) {
      await sh.page.goto("https://www.facebook.com/").catch(() => {});
    }
    const r = await sh.page.extract({
      instruction:
        "Is the user logged into Facebook? Look for the blue header bar with the user's account avatar and a 'What's on your mind?' composer. Return loggedIn=true|false.",
      schema: { loggedIn: "boolean" },
    }).catch(() => ({ loggedIn: false }));
    return Boolean((r as { loggedIn: boolean }).loggedIn);
  }

  async post(input: PostInput): Promise<PostResult> {
    const sh = await this.getStagehand();
    await sh.page.goto("https://www.facebook.com/");
    await sh.page.act("Click the 'What's on your mind?' composer at the top of the feed");

    if (input.media?.length) {
      const chooserPromise = sh.page.waitForEvent("filechooser");
      await sh.page.act("Click the 'Photo/video' button in the post dialog");
      const chooser = await chooserPromise;
      await chooser.setFiles(input.media);
    }

    if (input.text) {
      const caption = this.composeCaption(input);
      await sh.page.act(`Type the following into the post text area: ${JSON.stringify(caption)}`);
    }

    await sh.page.act("Click the 'Post' button at the bottom of the dialog");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now() };
  }

  private composeCaption(input: PostInput): string {
    let caption = input.text ?? "";
    if (input.hashtags?.length) {
      caption += "\n\n" + input.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ");
    }
    return caption;
  }

  async comment(input: CommentInput): Promise<CommentResult> {
    const sh = await this.getStagehand();
    await sh.page.goto(input.url);
    await sh.page.act("Click the 'Write a comment...' input under the post");
    await sh.page.act(`Type the comment: ${JSON.stringify(input.text)}`);
    await sh.page.act("Press Enter to submit the comment");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url };
  }

  async like(input: LikeInput): Promise<LikeResult> {
    const sh = await this.getStagehand();
    await sh.page.goto(input.url);
    await sh.page.act("Click the 'Like' button (thumbs up) under the post");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url, liked: true };
  }

  async unlike(input: LikeInput): Promise<LikeResult> {
    const sh = await this.getStagehand();
    await sh.page.goto(input.url);
    await sh.page.act("Click the (currently-active blue) Like button under the post to unlike it");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url, liked: false };
  }

  async follow(input: FollowInput): Promise<FollowResult> {
    const sh = await this.getStagehand();
    const handle = input.username.replace(/^@/, "");
    await sh.page.goto(`https://www.facebook.com/${handle}`);
    await sh.page.act("Click the 'Follow' button on the profile header. If you see 'Add Friend' instead, click that.");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), following: true };
  }

  async unfollow(input: FollowInput): Promise<FollowResult> {
    const sh = await this.getStagehand();
    const handle = input.username.replace(/^@/, "");
    await sh.page.goto(`https://www.facebook.com/${handle}`);
    await sh.page.act("Click the 'Following' button, then click 'Unfollow' in the menu");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), following: false };
  }
}

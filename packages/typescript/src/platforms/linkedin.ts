/**
 * LinkedIn adapter.
 *
 * Notes:
 *   - Watches for "We noticed an unusual login attempt" challenge — surfaced
 *     as ChallengeError. Solve once via Browserbase Live View to clear.
 *   - "Follow" maps to "Connect" or "Follow" depending on the relationship.
 *     The adapter prefers the existing button label.
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
import { ChallengeError } from "../core/errors.js";

export class LinkedInAdapter extends BasePlatform {
  protected loginUrl(): string {
    return "https://www.linkedin.com/login";
  }

  protected async performLogin(creds: Credentials): Promise<void> {
    const sh = await this.getStagehand();
    await sh.page.act(`Type "${creds.username}" into the email field`);
    await sh.page.act(`Type "${creds.password}" into the password field`);
    await sh.page.act("Click the Sign in button");
    await sh.page.waitForLoadState("networkidle").catch(() => {});

    const challenge = await sh.page.extract({
      instruction:
        "Is LinkedIn showing a security checkpoint, captcha, or 'unusual login attempt' page? Return blocked=true|false.",
      schema: { blocked: "boolean" },
    }).catch(() => ({ blocked: false }));
    if ((challenge as { blocked: boolean }).blocked) {
      throw new ChallengeError(
        "LinkedIn returned a security checkpoint. Solve it once via Browserbase Live View.",
      );
    }

    const mfa = await sh.page.extract({
      instruction: "Is LinkedIn asking for a verification code? Return mfa=true|false.",
      schema: { mfa: "boolean" },
    }).catch(() => ({ mfa: false }));
    if ((mfa as { mfa: boolean }).mfa) {
      const code = await resolveMfa(
        { description: "LinkedIn 2FA", channel: "unknown" },
        creds,
        this.onMfaChallenge,
      );
      await sh.page.act(`Type "${code}" into the verification code field`);
      await sh.page.act("Click Submit");
      await sh.page.waitForLoadState("networkidle").catch(() => {});
    }
  }

  async isLoggedIn(): Promise<boolean> {
    const sh = await this.getStagehand();
    if (!sh.page.url().includes("linkedin.com")) {
      await sh.page.goto("https://www.linkedin.com/feed/").catch(() => {});
    }
    const r = await sh.page.extract({
      instruction:
        "Is the user logged into LinkedIn? Look for the top-nav 'Me' menu with a profile photo or a 'Start a post' composer. Return loggedIn=true|false.",
      schema: { loggedIn: "boolean" },
    }).catch(() => ({ loggedIn: false }));
    return Boolean((r as { loggedIn: boolean }).loggedIn);
  }

  async post(input: PostInput): Promise<PostResult> {
    const sh = await this.getStagehand();
    await sh.page.goto("https://www.linkedin.com/feed/");
    await sh.page.act("Click the 'Start a post' button at the top of the feed");

    if (input.media?.length) {
      const chooserPromise = sh.page.waitForEvent("filechooser");
      await sh.page.act("Click the 'Add a photo' or 'Add a video' button in the post composer dialog");
      const chooser = await chooserPromise;
      await chooser.setFiles(input.media);
      await sh.page.act("Click 'Done' if a photo confirmation dialog is shown").catch(() => undefined);
    }

    if (input.text) {
      const caption = this.composeCaption(input);
      await sh.page.act(`Type the following into the post body: ${JSON.stringify(caption)}`);
    }

    await sh.page.act("Click the 'Post' button to publish");
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
    await sh.page.act("Click the 'Comment' button under the post to open the comment composer");
    await sh.page.act(`Type the comment: ${JSON.stringify(input.text)}`);
    await sh.page.act("Click the 'Post' button next to the comment composer");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url };
  }

  async like(input: LikeInput): Promise<LikeResult> {
    const sh = await this.getStagehand();
    await sh.page.goto(input.url);
    await sh.page.act("Click the 'Like' button (thumbs-up) under the post");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url, liked: true };
  }

  async unlike(input: LikeInput): Promise<LikeResult> {
    const sh = await this.getStagehand();
    await sh.page.goto(input.url);
    await sh.page.act("Click the (currently-active) Like reaction under the post to remove it");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url, liked: false };
  }

  async follow(input: FollowInput): Promise<FollowResult> {
    const sh = await this.getStagehand();
    const handle = input.username.replace(/^@/, "").replace(/^in\//, "");
    await sh.page.goto(`https://www.linkedin.com/in/${handle}/`);
    await sh.page.act(
      "Click the 'Follow' button on the profile header. If only 'Connect' is visible, click 'More' first and then 'Follow'.",
    );
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), following: true };
  }

  async unfollow(input: FollowInput): Promise<FollowResult> {
    const sh = await this.getStagehand();
    const handle = input.username.replace(/^@/, "").replace(/^in\//, "");
    await sh.page.goto(`https://www.linkedin.com/in/${handle}/`);
    await sh.page.act(
      "Click 'More' on the profile header, then click 'Unfollow' in the dropdown",
    );
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), following: false };
  }
}

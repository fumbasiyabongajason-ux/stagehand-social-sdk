/**
 * TikTok adapter.
 *
 * Notes:
 *   - Uses tiktok.com/upload for posting (videos only — no still images on web).
 *   - Comment threading: TikTok comments appear in a side drawer; like/comment
 *     uses the video page's UI.
 *   - Captchas are common; recommend Browserbase residential proxies.
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

export class TikTokAdapter extends BasePlatform {
  protected loginUrl(): string {
    return "https://www.tiktok.com/login/phone-or-email/email";
  }

  protected async performLogin(creds: Credentials): Promise<void> {
    const sh = await this.getStagehand();
    await sh.page.act(`Type "${creds.username}" into the email or username field`);
    await sh.page.act(`Type "${creds.password}" into the password field`);
    await sh.page.act("Click the Log in button");
    await sh.page.waitForLoadState("networkidle").catch(() => {});

    const captcha = await sh.page.extract({
      instruction: "Is a captcha (slider, puzzle, or 'verify you are human') visible? Return captcha=true|false.",
      schema: { captcha: "boolean" },
    }).catch(() => ({ captcha: false }));
    if ((captcha as { captcha: boolean }).captcha) {
      throw new ChallengeError(
        "TikTok showed a captcha. Solve it once via Browserbase Live View, or enable captcha-solving on your Browserbase project.",
      );
    }

    const mfa = await sh.page.extract({
      instruction: "Is TikTok asking for a verification code? Return mfa=true|false plus hint.",
      schema: { mfa: "boolean", hint: "string" },
    }).catch(() => ({ mfa: false, hint: "" }));
    const m = mfa as { mfa: boolean; hint?: string };
    if (m.mfa) {
      const code = await resolveMfa(
        { description: "TikTok 2FA", channel: "unknown", hint: m.hint },
        creds,
        this.onMfaChallenge,
      );
      await sh.page.act(`Type "${code}" into the verification code field`);
      await sh.page.act("Click the Verify button");
      await sh.page.waitForLoadState("networkidle").catch(() => {});
    }
  }

  async isLoggedIn(): Promise<boolean> {
    const sh = await this.getStagehand();
    if (!sh.page.url().includes("tiktok.com")) {
      await sh.page.goto("https://www.tiktok.com/").catch(() => {});
    }
    const r = await sh.page.extract({
      instruction:
        "Is the user logged into TikTok? Look for a profile avatar in the top right, an Inbox icon, or an Upload button. Return loggedIn=true|false.",
      schema: { loggedIn: "boolean" },
    }).catch(() => ({ loggedIn: false }));
    return Boolean((r as { loggedIn: boolean }).loggedIn);
  }

  async post(input: PostInput): Promise<PostResult> {
    const sh = await this.getStagehand();
    if (!input.media || input.media.length === 0) {
      throw new Error("TikTok requires a video file");
    }
    await sh.page.goto("https://www.tiktok.com/upload");
    const chooserPromise = sh.page.waitForEvent("filechooser");
    await sh.page.act("Click the 'Select video' upload button");
    const chooser = await chooserPromise;
    await chooser.setFiles([input.media[0]!]);

    if (input.text) {
      const caption = this.composeCaption(input);
      await sh.page.act(`Clear the caption field, then type: ${JSON.stringify(caption)}`);
    }

    // Wait for upload to finish.
    await sh.page.waitForFunction(
      "() => !!document.querySelector('button[data-e2e=\"upload-post-button\"]:not([disabled])') || !!document.querySelector('button:not([disabled]):has-text(\"Post\")')",
      { timeout: 120_000 },
    ).catch(() => {});

    await sh.page.act("Click the 'Post' button to publish");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now() };
  }

  private composeCaption(input: PostInput): string {
    let caption = input.text ?? "";
    if (input.mentions?.length) {
      caption += " " + input.mentions.map((m) => `@${m.replace(/^@/, "")}`).join(" ");
    }
    if (input.hashtags?.length) {
      caption += " " + input.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ");
    }
    return caption.trim();
  }

  async comment(input: CommentInput): Promise<CommentResult> {
    const sh = await this.getStagehand();
    await sh.page.goto(input.url);
    await sh.page.act("Open the comments panel by clicking the speech-bubble icon if it isn't already open");
    await sh.page.act("Click the comment input field at the bottom of the comments panel");
    await sh.page.act(`Type the comment: ${JSON.stringify(input.text)}`);
    await sh.page.act("Click the send / post button next to the comment input");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url };
  }

  async like(input: LikeInput): Promise<LikeResult> {
    const sh = await this.getStagehand();
    await sh.page.goto(input.url);
    await sh.page.act("Click the heart icon next to the video to like it");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url, liked: true };
  }

  async unlike(input: LikeInput): Promise<LikeResult> {
    const sh = await this.getStagehand();
    await sh.page.goto(input.url);
    await sh.page.act("Click the (already-filled red) heart icon next to the video to unlike it");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url, liked: false };
  }

  async follow(input: FollowInput): Promise<FollowResult> {
    const sh = await this.getStagehand();
    const handle = input.username.replace(/^@/, "");
    await sh.page.goto(`https://www.tiktok.com/@${handle}`);
    await sh.page.act("Click the Follow button on the profile header");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), following: true };
  }

  async unfollow(input: FollowInput): Promise<FollowResult> {
    const sh = await this.getStagehand();
    const handle = input.username.replace(/^@/, "");
    await sh.page.goto(`https://www.tiktok.com/@${handle}`);
    await sh.page.act("Click the 'Following' button on the profile header, then confirm 'Unfollow' in the dialog");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), following: false };
  }
}

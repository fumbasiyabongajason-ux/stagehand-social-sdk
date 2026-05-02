/**
 * Instagram adapter.
 *
 * Notes:
 *   - Uses instagram.com web composer (Posts → New Post button).
 *   - Login flow may surface "Save your login info?" / "Turn on notifications?"
 *     dialogs — performLogin() dismisses both.
 *   - Reels and carousels are supported via the same `post()` entry; the
 *     SDK lets Instagram detect media type from file extension.
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

export class InstagramAdapter extends BasePlatform {
  protected loginUrl(): string {
    return "https://www.instagram.com/accounts/login/";
  }

  protected async performLogin(creds: Credentials): Promise<void> {
    const sh = await this.getStagehand();
    await sh.page.act(`Type "${creds.username}" into the username / phone / email field`);
    await sh.page.act(`Type "${creds.password}" into the password field`);
    await sh.page.act("Click the Log in button");
    await sh.page.waitForLoadState("networkidle").catch(() => {});

    // Detect MFA prompt
    const mfa = await sh.page.extract({
      instruction:
        "Is Instagram asking for a 2FA / verification code? Return mfa=true plus channel " +
        "('sms' | 'email' | 'authenticator' | 'unknown') and any visible hint.",
      schema: { mfa: "boolean", channel: "string", hint: "string" },
    }).catch(() => ({ mfa: false, channel: "unknown" as const, hint: "" }));

    if (mfa && (mfa as { mfa: boolean }).mfa) {
      const m = mfa as { mfa: boolean; channel: string; hint?: string };
      const code = await resolveMfa(
        {
          description: "Instagram requires a 2FA code",
          channel: (["sms", "email", "authenticator"].includes(m.channel)
            ? m.channel
            : "unknown") as "sms" | "email" | "authenticator" | "unknown",
          hint: m.hint,
        },
        creds,
        this.onMfaChallenge,
      );
      await sh.page.act(`Type "${code}" into the verification code field`);
      await sh.page.act("Click Confirm");
      await sh.page.waitForLoadState("networkidle").catch(() => {});
    }

    // Detect captcha / suspicious-activity wall
    const blocked = await sh.page.extract({
      instruction:
        "Is the page blocked by a captcha, 'suspicious activity', or 'we detected unusual login attempts' challenge? Return blocked=true|false.",
      schema: { blocked: "boolean" },
    }).catch(() => ({ blocked: false }));
    if ((blocked as { blocked: boolean }).blocked) {
      throw new ChallengeError(
        "Instagram blocked the login with a security challenge. Try logging in via Browserbase Live View once to clear it.",
      );
    }

    // Dismiss "Save your login info?" + "Turn on notifications?" prompts.
    for (const _ of [0, 1]) {
      await sh.page
        .act("If a dialog asks 'Save your login info?', click 'Not now'. If a dialog asks 'Turn on notifications?', click 'Not Now'.")
        .catch(() => undefined);
    }
  }

  async isLoggedIn(): Promise<boolean> {
    const sh = await this.getStagehand();
    if (!sh.page.url().includes("instagram.com")) {
      await sh.page.goto("https://www.instagram.com/").catch(() => {});
    }
    const r = await sh.page.extract({
      instruction:
        "Is the user logged into Instagram? Look for a profile avatar in the bottom nav or top-right, or a 'Create' button. Return loggedIn=true|false.",
      schema: { loggedIn: "boolean" },
    }).catch(() => ({ loggedIn: false }));
    return Boolean((r as { loggedIn: boolean }).loggedIn);
  }

  async post(input: PostInput): Promise<PostResult> {
    const sh = await this.getStagehand();
    if (!input.media || input.media.length === 0) {
      throw new Error("Instagram requires at least one media file (image or video)");
    }
    await sh.page.goto("https://www.instagram.com/");
    await sh.page.act("Click the 'Create' button in the left sidebar, then click 'Post'");

    // Upload via the file chooser exposed by the composer's "Select from computer" button.
    const fileChooserPromise = sh.page.waitForEvent("filechooser");
    await sh.page.act("Click the 'Select from computer' button");
    const chooser = await fileChooserPromise;
    await chooser.setFiles(input.media);

    // Click through Crop → Edit → Caption screens.
    await sh.page.act("Click the 'Next' button to advance past the crop step");
    await sh.page.act("Click the 'Next' button to advance past the edit step");

    if (input.text) {
      const caption = this.composeCaption(input);
      await sh.page.act(`Type the following caption into the caption field: ${JSON.stringify(caption)}`);
    }
    if (input.location) {
      await sh.page.act(`Click 'Add location' and type "${input.location}", then click the first suggestion`);
    }

    await sh.page.act("Click the 'Share' button to publish the post");
    await sh.page.waitForLoadState("networkidle").catch(() => {});

    // Best-effort URL extraction.
    const r = await sh.page.extract({
      instruction:
        "Did the post share successfully? If a 'Your post has been shared' confirmation is visible, return success=true. " +
        "If a permalink is visible, return postUrl.",
      schema: { success: "boolean", postUrl: "string" },
    }).catch(() => ({ success: true, postUrl: "" }));

    const result = r as { success: boolean; postUrl?: string };
    return {
      success: result.success !== false,
      at: this.now(),
      postUrl: result.postUrl || undefined,
    };
  }

  private composeCaption(input: PostInput): string {
    let caption = input.text ?? "";
    if (input.mentions?.length) {
      caption += "\n\n" + input.mentions.map((m) => `@${m.replace(/^@/, "")}`).join(" ");
    }
    if (input.hashtags?.length) {
      caption += "\n\n" + input.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ");
    }
    return caption;
  }

  async comment(input: CommentInput): Promise<CommentResult> {
    const sh = await this.getStagehand();
    await sh.page.goto(input.url);
    await sh.page.act("Click the comment input field at the bottom of the post");
    await sh.page.act(`Type the comment: ${JSON.stringify(input.text)}`);
    await sh.page.act("Click the 'Post' button to submit the comment");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url };
  }

  async like(input: LikeInput): Promise<LikeResult> {
    const sh = await this.getStagehand();
    await sh.page.goto(input.url);
    await sh.page.act("Click the heart icon under the post to like it");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url, liked: true };
  }

  async unlike(input: LikeInput): Promise<LikeResult> {
    const sh = await this.getStagehand();
    await sh.page.goto(input.url);
    await sh.page.act("Click the (already-filled red) heart icon under the post to unlike it");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url, liked: false };
  }

  async follow(input: FollowInput): Promise<FollowResult> {
    const sh = await this.getStagehand();
    const handle = input.username.replace(/^@/, "");
    await sh.page.goto(`https://www.instagram.com/${handle}/`);
    await sh.page.act("Click the 'Follow' button on the profile header");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), following: true };
  }

  async unfollow(input: FollowInput): Promise<FollowResult> {
    const sh = await this.getStagehand();
    const handle = input.username.replace(/^@/, "");
    await sh.page.goto(`https://www.instagram.com/${handle}/`);
    await sh.page.act("Click the 'Following' button on the profile header");
    await sh.page.act("In the dialog that appears, click 'Unfollow'");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), following: false };
  }
}

/**
 * X / Twitter adapter.
 *
 * Notes:
 *   - x.com login is multi-step: username → "Suspicious login? Confirm email" → password.
 *   - Posting goes through the home composer; replying goes through the tweet permalink.
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

export class XAdapter extends BasePlatform {
  protected loginUrl(): string {
    return "https://x.com/i/flow/login";
  }

  protected async performLogin(creds: Credentials): Promise<void> {
    const sh = await this.getStagehand();
    await sh.page.act(`Type "${creds.username}" into the username field`);
    await sh.page.act("Click the Next button");
    await sh.page.waitForLoadState("networkidle").catch(() => {});

    // Possible "There was unusual login activity — confirm your email" step.
    const verifyStep = await sh.page.extract({
      instruction: "Is the page asking to confirm your email or phone before entering the password? Return needsVerify=true|false.",
      schema: { needsVerify: "boolean" },
    }).catch(() => ({ needsVerify: false }));
    if ((verifyStep as { needsVerify: boolean }).needsVerify) {
      await sh.page.act(`Type "${creds.username}" into the email or phone confirmation field`);
      await sh.page.act("Click Next");
    }

    await sh.page.act(`Type "${creds.password}" into the password field`);
    await sh.page.act("Click the Log in button");
    await sh.page.waitForLoadState("networkidle").catch(() => {});

    const mfa = await sh.page.extract({
      instruction: "Is X asking for a verification code? Return mfa=true|false plus channel and hint.",
      schema: { mfa: "boolean", channel: "string", hint: "string" },
    }).catch(() => ({ mfa: false, channel: "unknown" as const, hint: "" }));
    const m = mfa as { mfa: boolean; channel: string; hint?: string };
    if (m.mfa) {
      const code = await resolveMfa(
        {
          description: "X requires verification code",
          channel: (["sms", "email", "authenticator"].includes(m.channel)
            ? m.channel
            : "unknown") as "sms" | "email" | "authenticator" | "unknown",
          hint: m.hint,
        },
        creds,
        this.onMfaChallenge,
      );
      await sh.page.act(`Type "${code}" into the verification code field`);
      await sh.page.act("Click Next or Verify");
      await sh.page.waitForLoadState("networkidle").catch(() => {});
    }
  }

  async isLoggedIn(): Promise<boolean> {
    const sh = await this.getStagehand();
    if (!sh.page.url().includes("x.com") && !sh.page.url().includes("twitter.com")) {
      await sh.page.goto("https://x.com/home").catch(() => {});
    }
    const r = await sh.page.extract({
      instruction:
        "Is the user logged into X / Twitter? Look for a 'Post' button in the left sidebar or a profile avatar. Return loggedIn=true|false.",
      schema: { loggedIn: "boolean" },
    }).catch(() => ({ loggedIn: false }));
    return Boolean((r as { loggedIn: boolean }).loggedIn);
  }

  async post(input: PostInput): Promise<PostResult> {
    const sh = await this.getStagehand();
    await sh.page.goto("https://x.com/home");
    await sh.page.act("Click the 'Post' button in the left sidebar to open the composer");

    if (input.media?.length) {
      const chooserPromise = sh.page.waitForEvent("filechooser");
      await sh.page.act("Click the media (image/video) attach button in the composer");
      const chooser = await chooserPromise;
      await chooser.setFiles(input.media);
    }

    const body = this.composeCaption(input);
    if (body) {
      await sh.page.act(`Type the following text into the post composer body: ${JSON.stringify(body)}`);
    }

    await sh.page.act("Click the 'Post' button to publish the tweet");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now() };
  }

  private composeCaption(input: PostInput): string {
    let body = input.text ?? "";
    if (input.mentions?.length) {
      body += " " + input.mentions.map((m) => `@${m.replace(/^@/, "")}`).join(" ");
    }
    if (input.hashtags?.length) {
      body += " " + input.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ");
    }
    return body.trim();
  }

  async comment(input: CommentInput): Promise<CommentResult> {
    const sh = await this.getStagehand();
    await sh.page.goto(input.url);
    await sh.page.act("Click the reply button (speech bubble icon) below the tweet");
    await sh.page.act(`Type the reply: ${JSON.stringify(input.text)}`);
    await sh.page.act("Click the 'Reply' button to submit");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url };
  }

  async like(input: LikeInput): Promise<LikeResult> {
    const sh = await this.getStagehand();
    await sh.page.goto(input.url);
    await sh.page.act("Click the heart icon below the tweet to like it");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url, liked: true };
  }

  async unlike(input: LikeInput): Promise<LikeResult> {
    const sh = await this.getStagehand();
    await sh.page.goto(input.url);
    await sh.page.act("Click the (already-filled red) heart icon below the tweet to unlike it");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url, liked: false };
  }

  async follow(input: FollowInput): Promise<FollowResult> {
    const sh = await this.getStagehand();
    const handle = input.username.replace(/^@/, "");
    await sh.page.goto(`https://x.com/${handle}`);
    await sh.page.act("Click the Follow button on the profile header");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), following: true };
  }

  async unfollow(input: FollowInput): Promise<FollowResult> {
    const sh = await this.getStagehand();
    const handle = input.username.replace(/^@/, "");
    await sh.page.goto(`https://x.com/${handle}`);
    await sh.page.act("Click the 'Following' button on the profile header");
    await sh.page.act("Click 'Unfollow' in the confirmation dialog");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), following: false };
  }
}

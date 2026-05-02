/**
 * Threads adapter.
 *
 * Notes:
 *   - Login uses Instagram credentials (Threads is an Instagram product).
 *     The adapter clicks "Continue with Instagram" and reuses IG cookies if
 *     the IG context is already authenticated; else falls back to entering
 *     IG credentials directly on threads.net.
 *   - "Follow" maps to following on Threads (which mirrors IG follow).
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

export class ThreadsAdapter extends BasePlatform {
  protected loginUrl(): string {
    return "https://www.threads.net/login";
  }

  protected async performLogin(creds: Credentials): Promise<void> {
    const sh = await this.getStagehand();
    // Click "Continue with Instagram" if available.
    await sh.page.act("Click 'Continue with Instagram' if visible").catch(() => undefined);
    await sh.page.waitForLoadState("networkidle").catch(() => {});

    // If IG cookie carryover already logged us in, exit.
    if (await this.isLoggedIn().catch(() => false)) return;

    // Else fall through: type IG credentials on Threads' login page.
    await sh.page.act(`Type "${creds.username}" into the username field`);
    await sh.page.act(`Type "${creds.password}" into the password field`);
    await sh.page.act("Click the Log in button");
    await sh.page.waitForLoadState("networkidle").catch(() => {});

    const mfa = await sh.page.extract({
      instruction: "Is Threads / Instagram asking for a 2FA code? Return mfa=true|false.",
      schema: { mfa: "boolean" },
    }).catch(() => ({ mfa: false }));
    if ((mfa as { mfa: boolean }).mfa) {
      const code = await resolveMfa(
        { description: "Threads 2FA (Instagram-backed)", channel: "unknown" },
        creds,
        this.onMfaChallenge,
      );
      await sh.page.act(`Type "${code}" into the verification code field`);
      await sh.page.act("Click Confirm");
      await sh.page.waitForLoadState("networkidle").catch(() => {});
    }
  }

  async isLoggedIn(): Promise<boolean> {
    const sh = await this.getStagehand();
    if (!sh.page.url().includes("threads.net")) {
      await sh.page.goto("https://www.threads.net/").catch(() => {});
    }
    const r = await sh.page.extract({
      instruction:
        "Is the user logged into Threads? Look for a profile avatar in the bottom nav, a 'New thread' button, or the home feed. Return loggedIn=true|false.",
      schema: { loggedIn: "boolean" },
    }).catch(() => ({ loggedIn: false }));
    return Boolean((r as { loggedIn: boolean }).loggedIn);
  }

  async post(input: PostInput): Promise<PostResult> {
    const sh = await this.getStagehand();
    await sh.page.goto("https://www.threads.net/");
    await sh.page.act("Click the 'New thread' button (pencil icon) in the left sidebar or bottom nav");

    if (input.media?.length) {
      const chooserPromise = sh.page.waitForEvent("filechooser");
      await sh.page.act("Click the attach (paperclip / photo) button in the new-thread composer");
      const chooser = await chooserPromise;
      await chooser.setFiles(input.media);
    }

    if (input.text) {
      const body = this.composeCaption(input);
      await sh.page.act(`Type the following into the thread body: ${JSON.stringify(body)}`);
    }

    await sh.page.act("Click the 'Post' button to publish the thread");
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
    await sh.page.act("Click the 'Reply' input under the thread");
    await sh.page.act(`Type the reply: ${JSON.stringify(input.text)}`);
    await sh.page.act("Click the 'Post' button to submit the reply");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url };
  }

  async like(input: LikeInput): Promise<LikeResult> {
    const sh = await this.getStagehand();
    await sh.page.goto(input.url);
    await sh.page.act("Click the heart icon under the thread to like it");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url, liked: true };
  }

  async unlike(input: LikeInput): Promise<LikeResult> {
    const sh = await this.getStagehand();
    await sh.page.goto(input.url);
    await sh.page.act("Click the (already-filled red) heart icon under the thread to unlike it");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), url: input.url, liked: false };
  }

  async follow(input: FollowInput): Promise<FollowResult> {
    const sh = await this.getStagehand();
    const handle = input.username.replace(/^@/, "");
    await sh.page.goto(`https://www.threads.net/@${handle}`);
    await sh.page.act("Click the 'Follow' button on the profile header");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), following: true };
  }

  async unfollow(input: FollowInput): Promise<FollowResult> {
    const sh = await this.getStagehand();
    const handle = input.username.replace(/^@/, "");
    await sh.page.goto(`https://www.threads.net/@${handle}`);
    await sh.page.act("Click the 'Following' button on the profile header, then click 'Unfollow' in the dialog");
    await sh.page.waitForLoadState("networkidle").catch(() => {});
    return { success: true, at: this.now(), following: false };
  }
}

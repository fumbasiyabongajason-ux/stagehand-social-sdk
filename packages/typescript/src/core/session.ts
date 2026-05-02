/**
 * Session manager — tracks one Browserbase context per (target, account)
 * and persists references on disk so logins survive across runs.
 *
 * On disk format (JSON):
 *   ~/.stagehand-social/sessions.json
 *   {
 *     "instagram::myaccount": {
 *       "target": { "kind": "platform", "platform": "instagram" },
 *       "account": "myaccount",
 *       "contextId": "ctx_abc123",
 *       "lastVerifiedAt": "2026-05-02T..."
 *     }
 *   }
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import Browserbase from "@browserbasehq/sdk";
import type { SessionRef, TargetKey } from "./types.js";
import { SessionError } from "./errors.js";

const DEFAULT_SESSION_DIR = path.join(os.homedir(), ".stagehand-social");
const SESSIONS_FILE = "sessions.json";

function targetKeyId(target: TargetKey): string {
  return target.kind === "platform"
    ? target.platform
    : `generic:${target.siteId}`;
}

function refKey(target: TargetKey, account: string): string {
  return `${targetKeyId(target)}::${account}`;
}

export class SessionManager {
  private cache: Record<string, SessionRef> = {};
  private loaded = false;
  private readonly sessionDir: string;
  private readonly bb: Browserbase;
  private readonly projectId: string;

  constructor(opts: {
    apiKey: string;
    projectId: string;
    sessionDir?: string;
  }) {
    this.sessionDir = opts.sessionDir ?? DEFAULT_SESSION_DIR;
    this.bb = new Browserbase({ apiKey: opts.apiKey });
    this.projectId = opts.projectId;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      await fs.mkdir(this.sessionDir, { recursive: true });
      const filePath = path.join(this.sessionDir, SESSIONS_FILE);
      const raw = await fs.readFile(filePath, "utf-8").catch(() => "{}");
      this.cache = JSON.parse(raw) as Record<string, SessionRef>;
    } catch (err) {
      throw new SessionError(
        `Failed to load session cache from ${this.sessionDir}`,
        err,
      );
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const filePath = path.join(this.sessionDir, SESSIONS_FILE);
    await fs.writeFile(filePath, JSON.stringify(this.cache, null, 2), "utf-8");
  }

  /** Look up an existing session ref. Returns undefined if none. */
  async get(target: TargetKey, account: string): Promise<SessionRef | undefined> {
    await this.ensureLoaded();
    return this.cache[refKey(target, account)];
  }

  /**
   * Get an existing context for (target, account), or create a fresh one.
   * Returns the contextId — pass this to Stagehand's `browserbaseSessionCreateParams`.
   */
  async getOrCreateContext(
    target: TargetKey,
    account: string,
  ): Promise<string> {
    await this.ensureLoaded();
    const existing = this.cache[refKey(target, account)];
    if (existing) return existing.contextId;

    const ctx = await this.bb.contexts.create({ projectId: this.projectId });
    const ref: SessionRef = {
      target,
      account,
      contextId: ctx.id,
    };
    this.cache[refKey(target, account)] = ref;
    await this.persist();
    return ctx.id;
  }

  /** Mark a session as verified-logged-in right now. */
  async markVerified(target: TargetKey, account: string): Promise<void> {
    await this.ensureLoaded();
    const key = refKey(target, account);
    const ref = this.cache[key];
    if (!ref) return;
    ref.lastVerifiedAt = new Date().toISOString();
    await this.persist();
  }

  /** Forget a session (e.g., after logout). Does NOT delete the Browserbase context. */
  async forget(target: TargetKey, account: string): Promise<void> {
    await this.ensureLoaded();
    delete this.cache[refKey(target, account)];
    await this.persist();
  }

  /** List all known sessions. */
  async list(): Promise<SessionRef[]> {
    await this.ensureLoaded();
    return Object.values(this.cache);
  }

  /** Build the Browserbase session params Stagehand expects. */
  buildSessionParams(contextId: string): {
    projectId: string;
    browserSettings: { context: { id: string; persist: boolean } };
  } {
    return {
      projectId: this.projectId,
      browserSettings: {
        context: { id: contextId, persist: true },
      },
    };
  }
}

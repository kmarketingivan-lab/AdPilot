/**
 * Social Publishing — Email Notification Service
 *
 * Sends email notifications for post publishing outcomes and token expiration
 * warnings via Amazon SES.
 */

import { sendEmail, renderTemplate } from "../email/ses";
import type { Platform, PostStatus } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────

interface PostSummary {
  id: string;
  content: string;
  hashtags: string[];
  publishedAt: Date | null;
  workspace: {
    name: string;
    members: Array<{
      user: {
        email: string;
        name: string | null;
      };
    }>;
  };
}

interface PlatformResult {
  platform: Platform;
  externalPostId: string | null;
  status: PostStatus;
  error: string | null;
}

interface SocialAccountSummary {
  platform: Platform;
  accountName: string;
  tokenExpiresAt: Date | null;
  workspace: {
    name: string;
    members: Array<{
      user: {
        email: string;
        name: string | null;
      };
    }>;
  };
}

// ─── Email Templates ─────────────────────────────────────────────

const BASE_STYLE = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-width: 600px;
  margin: 0 auto;
  padding: 24px;
  color: #1a1a1a;
`;

const SUCCESS_TEMPLATE = `
<div style="${BASE_STYLE}">
  <h2 style="color: #16a34a;">Post Published Successfully</h2>
  <p>Hi {{userName}},</p>
  <p>Your post in workspace <strong>{{workspaceName}}</strong> has been published successfully.</p>

  <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
    <p style="margin: 0; white-space: pre-wrap;">{{contentPreview}}</p>
    {{hashtagsHtml}}
  </div>

  <h3 style="margin-top: 24px;">Platform Results</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr style="background: #f8f8f8;">
      <th style="text-align: left; padding: 8px; border-bottom: 1px solid #e5e5e5;">Platform</th>
      <th style="text-align: left; padding: 8px; border-bottom: 1px solid #e5e5e5;">Status</th>
    </tr>
    {{platformRows}}
  </table>

  <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
    Published at: {{publishedAt}}
  </p>
</div>
`;

const FAILURE_TEMPLATE = `
<div style="${BASE_STYLE}">
  <h2 style="color: #dc2626;">Post Publishing Failed</h2>
  <p>Hi {{userName}},</p>
  <p>Your post in workspace <strong>{{workspaceName}}</strong> encountered errors during publishing.</p>

  <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
    <p style="margin: 0; white-space: pre-wrap;">{{contentPreview}}</p>
  </div>

  <h3 style="margin-top: 24px;">Errors</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr style="background: #f8f8f8;">
      <th style="text-align: left; padding: 8px; border-bottom: 1px solid #e5e5e5;">Platform</th>
      <th style="text-align: left; padding: 8px; border-bottom: 1px solid #e5e5e5;">Error</th>
    </tr>
    {{errorRows}}
  </table>

  <p style="color: #6b7280; font-size: 13px; margin-top: 16px;">
    The system will retry automatically up to 3 times with exponential backoff.
    If all retries fail, you can retry manually from the dashboard.
  </p>
</div>
`;

const TOKEN_EXPIRING_TEMPLATE = `
<div style="${BASE_STYLE}">
  <h2 style="color: #d97706;">Social Account Token Expiring Soon</h2>
  <p>Hi {{userName}},</p>
  <p>The access token for your <strong>{{platform}}</strong> account
     <strong>{{accountName}}</strong> in workspace <strong>{{workspaceName}}</strong>
     will expire in <strong>{{expiresIn}}</strong>.</p>

  <div style="background: #fffbeb; border-left: 4px solid #d97706; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
    <p style="margin: 0;">Please reconnect the account from your dashboard to avoid publishing interruptions.</p>
  </div>

  <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
    Token expires at: {{expiresAt}}
  </p>
</div>
`;

// ─── Helpers ─────────────────────────────────────────────────────

function truncate(text: string, maxLength: number = 200): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? "s" : ""}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""}`;
  return "less than 1 hour";
}

function getWorkspaceRecipients(
  workspace: PostSummary["workspace"] | SocialAccountSummary["workspace"],
): Array<{ email: string; name: string }> {
  return workspace.members.map((m) => ({
    email: m.user.email,
    name: m.user.name ?? m.user.email.split("@")[0],
  }));
}

// ─── Notification Functions ──────────────────────────────────────

/**
 * Send an email notification when a post has been published successfully
 * to all target platforms.
 */
export async function notifyPublishSuccess(
  post: PostSummary,
  platforms: PlatformResult[],
): Promise<void> {
  const recipients = getWorkspaceRecipients(post.workspace);
  if (recipients.length === 0) return;

  const hashtagsHtml =
    post.hashtags.length > 0
      ? `<p style="color: #6b7280; margin: 8px 0 0 0;">${escapeHtml(post.hashtags.map((h) => `#${h}`).join(" "))}</p>`
      : "";

  const platformRows = platforms
    .map(
      (p) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #f0f0f0;">${escapeHtml(p.platform)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #f0f0f0; color: #16a34a;">Published</td>
    </tr>`,
    )
    .join("");

  for (const recipient of recipients) {
    const html = renderTemplate(SUCCESS_TEMPLATE, {
      userName: escapeHtml(recipient.name),
      workspaceName: escapeHtml(post.workspace.name),
      contentPreview: escapeHtml(truncate(post.content)),
      hashtagsHtml,
      platformRows,
      publishedAt: post.publishedAt?.toISOString() ?? new Date().toISOString(),
    });

    try {
      await sendEmail({
        to: recipient.email,
        subject: `[AdPilot] Post published successfully — ${post.workspace.name}`,
        html,
        text: `Your post has been published successfully to ${platforms.map((p) => p.platform).join(", ")}.`,
      });
    } catch (error) {
      // Log but do not throw — notification failure should not affect publishing
      console.error(
        `[notifications] Failed to send success email to ${recipient.email}:`,
        error,
      );
    }
  }
}

/**
 * Send an email notification when a post has failed to publish
 * to one or more platforms.
 */
export async function notifyPublishFailure(
  post: PostSummary,
  errors: Array<{ platform: Platform; error: string }>,
): Promise<void> {
  const recipients = getWorkspaceRecipients(post.workspace);
  if (recipients.length === 0) return;

  const errorRows = errors
    .map(
      (e) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #f0f0f0;">${escapeHtml(e.platform)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #f0f0f0; color: #dc2626;">${escapeHtml(truncate(e.error, 150))}</td>
    </tr>`,
    )
    .join("");

  for (const recipient of recipients) {
    const html = renderTemplate(FAILURE_TEMPLATE, {
      userName: escapeHtml(recipient.name),
      workspaceName: escapeHtml(post.workspace.name),
      contentPreview: escapeHtml(truncate(post.content)),
      errorRows,
    });

    try {
      await sendEmail({
        to: recipient.email,
        subject: `[AdPilot] Post publishing failed — ${post.workspace.name}`,
        html,
        text: `Your post failed to publish. Errors: ${errors.map((e) => `${e.platform}: ${e.error}`).join("; ")}`,
      });
    } catch (error) {
      console.error(
        `[notifications] Failed to send failure email to ${recipient.email}:`,
        error,
      );
    }
  }
}

/**
 * Send a warning email when a social account's access token is
 * approaching expiration.
 */
export async function notifyTokenExpiring(
  account: SocialAccountSummary,
  expiresInMs: number,
): Promise<void> {
  const recipients = getWorkspaceRecipients(account.workspace);
  if (recipients.length === 0) return;

  for (const recipient of recipients) {
    const html = renderTemplate(TOKEN_EXPIRING_TEMPLATE, {
      userName: escapeHtml(recipient.name),
      platform: escapeHtml(account.platform),
      accountName: escapeHtml(account.accountName),
      workspaceName: escapeHtml(account.workspace.name),
      expiresIn: formatDuration(expiresInMs),
      expiresAt: account.tokenExpiresAt?.toISOString() ?? "Unknown",
    });

    try {
      await sendEmail({
        to: recipient.email,
        subject: `[AdPilot] ${account.platform} token expiring soon — ${account.accountName}`,
        html,
        text: `Your ${account.platform} account "${account.accountName}" token will expire in ${formatDuration(expiresInMs)}. Please reconnect from the dashboard.`,
      });
    } catch (error) {
      console.error(
        `[notifications] Failed to send token-expiring email to ${recipient.email}:`,
        error,
      );
    }
  }
}

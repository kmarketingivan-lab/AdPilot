import {
  SESClient,
  SendEmailCommand,
  SendBulkTemplatedEmailCommand,
} from "@aws-sdk/client-ses";
import { prisma } from "@/lib/prisma";
import { ses, renderTemplate } from "./ses";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SES_RATE_LIMIT = 50; // emails per second
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 1000; // 1 second between batches (50/sec)

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.adpilot.dev";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BulkEmailRecipient {
  email: string;
  contactId?: string;
  variables?: Record<string, string>;
}

export interface BulkEmailOptions {
  recipients: BulkEmailRecipient[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  campaignId: string;
  trackOpens?: boolean;
  trackClicks?: boolean;
  includeUnsubscribeLink?: boolean;
}

export interface SnsNotification {
  Type: string;
  Message: string;
  MessageId: string;
  TopicArn: string;
  SubscribeURL?: string;
}

export interface SesBounceNotification {
  notificationType: "Bounce";
  bounce: {
    bounceType: "Permanent" | "Transient" | "Undetermined";
    bouncedRecipients: { emailAddress: string }[];
    timestamp: string;
  };
  mail: { messageId: string; destination: string[] };
}

export interface SesComplaintNotification {
  notificationType: "Complaint";
  complaint: {
    complainedRecipients: { emailAddress: string }[];
    timestamp: string;
    complaintFeedbackType?: string;
  };
  mail: { messageId: string; destination: string[] };
}

export interface SesDeliveryNotification {
  notificationType: "Delivery";
  delivery: {
    recipients: string[];
    timestamp: string;
  };
  mail: { messageId: string; destination: string[] };
}

type SesEventNotification =
  | SesBounceNotification
  | SesComplaintNotification
  | SesDeliveryNotification;

// ---------------------------------------------------------------------------
// Tracking pixel & link insertion
// ---------------------------------------------------------------------------

/**
 * Insert a 1x1 transparent tracking pixel before </body>.
 * The pixel URL contains the campaign and contact ID for server-side tracking.
 */
export function insertTrackingPixel(
  html: string,
  campaignId: string,
  contactId?: string
): string {
  const params = new URLSearchParams({ cid: campaignId });
  if (contactId) params.set("rid", contactId);

  const pixelUrl = `${BASE_URL}/api/email/track/open?${params.toString()}`;
  const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${pixel}</body>`);
  }
  return html + pixel;
}

/**
 * Rewrite <a href="..."> links to pass through a click-tracking redirect.
 * Skips mailto: and # links.
 */
export function insertClickTracking(
  html: string,
  campaignId: string,
  contactId?: string
): string {
  return html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (_match: string, url: string) => {
      const params = new URLSearchParams({
        cid: campaignId,
        url,
      });
      if (contactId) params.set("rid", contactId);
      const trackUrl = `${BASE_URL}/api/email/track/click?${params.toString()}`;
      return `href="${trackUrl}"`;
    }
  );
}

/**
 * Append an unsubscribe link at the bottom of the email.
 */
export function insertUnsubscribeLink(
  html: string,
  campaignId: string,
  email: string
): string {
  const params = new URLSearchParams({ cid: campaignId, email });
  const unsubUrl = `${BASE_URL}/api/email/unsubscribe?${params.toString()}`;

  const unsubBlock = `
    <div style="text-align:center;padding:20px 0 10px;font-size:12px;color:#999;">
      <a href="${unsubUrl}" style="color:#999;text-decoration:underline;">Unsubscribe</a>
    </div>
  `;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${unsubBlock}</body>`);
  }
  return html + unsubBlock;
}

// ---------------------------------------------------------------------------
// Bulk email sending (respects 50/sec SES rate limit)
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send emails in batches to respect SES rate limits.
 * Returns per-recipient results.
 */
export async function sendBulkEmail(
  options: BulkEmailOptions
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const {
    recipients,
    subject,
    html,
    from,
    replyTo,
    campaignId,
    trackOpens = true,
    trackClicks = true,
    includeUnsubscribeLink = true,
  } = options;

  const fromAddress =
    from ?? process.env.SES_FROM_EMAIL ?? "noreply@adpilot.dev";

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  // Process in batches
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);

    // Send each email in the batch concurrently
    const batchPromises = batch.map(async (recipient) => {
      try {
        // Personalize HTML with merge variables
        let personalizedHtml = recipient.variables
          ? renderTemplate(html, recipient.variables)
          : html;

        let personalizedSubject = recipient.variables
          ? renderTemplate(subject, recipient.variables)
          : subject;

        // Insert tracking elements
        if (trackOpens) {
          personalizedHtml = insertTrackingPixel(
            personalizedHtml,
            campaignId,
            recipient.contactId
          );
        }
        if (trackClicks) {
          personalizedHtml = insertClickTracking(
            personalizedHtml,
            campaignId,
            recipient.contactId
          );
        }
        if (includeUnsubscribeLink) {
          personalizedHtml = insertUnsubscribeLink(
            personalizedHtml,
            campaignId,
            recipient.email
          );
        }

        const command = new SendEmailCommand({
          Source: fromAddress,
          Destination: { ToAddresses: [recipient.email] },
          Message: {
            Subject: { Data: personalizedSubject, Charset: "UTF-8" },
            Body: {
              Html: { Data: personalizedHtml, Charset: "UTF-8" },
            },
          },
          ...(replyTo && { ReplyToAddresses: [replyTo] }),
        });

        await ses.send(command);

        // Record SENT event
        await prisma.emailEvent.create({
          data: {
            type: "SENT",
            contactId: recipient.contactId ?? null,
            campaignId,
            metadata: { email: recipient.email },
          },
        });

        sent++;
      } catch (err) {
        failed++;
        const message =
          err instanceof Error ? err.message : "Unknown send error";
        errors.push(`${recipient.email}: ${message}`);
      }
    });

    await Promise.all(batchPromises);

    // Wait before next batch to respect rate limit
    if (i + BATCH_SIZE < recipients.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return { sent, failed, errors };
}

// ---------------------------------------------------------------------------
// SNS Webhook handler for bounce/complaint/delivery notifications
// ---------------------------------------------------------------------------

/**
 * Process an incoming SNS notification from Amazon SES.
 * Call this from a Next.js API route handler.
 */
export async function handleSnsNotification(body: SnsNotification) {
  // Handle SNS subscription confirmation
  if (body.Type === "SubscriptionConfirmation" && body.SubscribeURL) {
    // Auto-confirm the subscription
    await fetch(body.SubscribeURL);
    return { action: "subscription_confirmed" };
  }

  if (body.Type !== "Notification") {
    return { action: "ignored", reason: "not a notification" };
  }

  const notification: SesEventNotification = JSON.parse(body.Message);

  switch (notification.notificationType) {
    case "Bounce":
      return handleBounce(notification);
    case "Complaint":
      return handleComplaint(notification);
    case "Delivery":
      return handleDelivery(notification);
    default:
      return { action: "ignored", reason: "unknown notification type" };
  }
}

async function handleBounce(notification: SesBounceNotification) {
  const { bouncedRecipients, bounceType } = notification.bounce;
  const isPermanent = bounceType === "Permanent";

  // Batch: collect all emails and do a single lookup
  const emails = bouncedRecipients.map((r) => r.emailAddress);

  // Single batched query for all subscribers matching any bounced email
  const subscribers = await prisma.emailSubscriber.findMany({
    where: { email: { in: emails } },
  });

  if (isPermanent) {
    // Batch update: mark all matching subscribers as bounced
    await prisma.emailSubscriber.updateMany({
      where: { email: { in: emails } },
      data: { status: "BOUNCED" },
    });
  }

  // Collect unique listIds and fetch most recent SENT campaign for each
  const listIds = [...new Set(subscribers.map((s) => s.listId))];
  const campaigns = await prisma.emailCampaign.findMany({
    where: { listId: { in: listIds }, status: "SENT" },
    orderBy: { sentAt: "desc" },
  });

  // Build a map of listId -> most recent campaign
  const campaignByListId = new Map<string, typeof campaigns[0]>();
  for (const campaign of campaigns) {
    if (!campaignByListId.has(campaign.listId)) {
      campaignByListId.set(campaign.listId, campaign);
    }
  }

  // Create bounce events for each subscriber's most recent campaign
  const subscribersByEmail = new Map<string, typeof subscribers>();
  for (const sub of subscribers) {
    const existing = subscribersByEmail.get(sub.email) ?? [];
    existing.push(sub);
    subscribersByEmail.set(sub.email, existing);
  }

  const eventCreates: Promise<unknown>[] = [];
  for (const email of emails) {
    const emailSubs = subscribersByEmail.get(email) ?? [];
    for (const sub of emailSubs) {
      const campaign = campaignByListId.get(sub.listId);
      if (campaign) {
        eventCreates.push(
          prisma.emailEvent.create({
            data: {
              type: "BOUNCED",
              campaignId: campaign.id,
              metadata: { email, bounceType },
            },
          })
        );
      }
    }
  }
  await Promise.all(eventCreates);

  return {
    action: "bounce_processed",
    count: bouncedRecipients.length,
    permanent: isPermanent,
  };
}

async function handleComplaint(notification: SesComplaintNotification) {
  const { complainedRecipients } = notification.complaint;

  // Batch: collect all emails
  const emails = complainedRecipients.map((r) => r.emailAddress);

  // Batch unsubscribe all complainants from all lists
  await prisma.emailSubscriber.updateMany({
    where: { email: { in: emails } },
    data: { status: "UNSUBSCRIBED" },
  });

  // Single batched query for all subscribers matching complained emails
  const subscribers = await prisma.emailSubscriber.findMany({
    where: { email: { in: emails } },
  });

  // Collect unique listIds and fetch most recent SENT campaign for each
  const listIds = [...new Set(subscribers.map((s) => s.listId))];
  const campaigns = await prisma.emailCampaign.findMany({
    where: { listId: { in: listIds }, status: "SENT" },
    orderBy: { sentAt: "desc" },
  });

  // Build a map of listId -> most recent campaign
  const campaignByListId = new Map<string, typeof campaigns[0]>();
  for (const campaign of campaigns) {
    if (!campaignByListId.has(campaign.listId)) {
      campaignByListId.set(campaign.listId, campaign);
    }
  }

  // Create complaint events
  const subscribersByEmail = new Map<string, typeof subscribers>();
  for (const sub of subscribers) {
    const existing = subscribersByEmail.get(sub.email) ?? [];
    existing.push(sub);
    subscribersByEmail.set(sub.email, existing);
  }

  const eventCreates: Promise<unknown>[] = [];
  for (const email of emails) {
    const emailSubs = subscribersByEmail.get(email) ?? [];
    for (const sub of emailSubs) {
      const campaign = campaignByListId.get(sub.listId);
      if (campaign) {
        eventCreates.push(
          prisma.emailEvent.create({
            data: {
              type: "COMPLAINED",
              campaignId: campaign.id,
              metadata: { email },
            },
          })
        );
      }
    }
  }
  await Promise.all(eventCreates);

  return {
    action: "complaint_processed",
    count: complainedRecipients.length,
  };
}

async function handleDelivery(notification: SesDeliveryNotification) {
  const { recipients } = notification.delivery;

  // Single batched query for all subscribers matching delivered emails
  const subscribers = await prisma.emailSubscriber.findMany({
    where: { email: { in: recipients } },
  });

  // Collect unique listIds and fetch most recent SENDING/SENT campaign for each
  const listIds = [...new Set(subscribers.map((s) => s.listId))];
  const campaigns = await prisma.emailCampaign.findMany({
    where: { listId: { in: listIds }, status: { in: ["SENDING", "SENT"] } },
    orderBy: { sentAt: "desc" },
  });

  // Build a map of listId -> most recent campaign
  const campaignByListId = new Map<string, typeof campaigns[0]>();
  for (const campaign of campaigns) {
    if (!campaignByListId.has(campaign.listId)) {
      campaignByListId.set(campaign.listId, campaign);
    }
  }

  // Create delivery events
  const subscribersByEmail = new Map<string, typeof subscribers>();
  for (const sub of subscribers) {
    const existing = subscribersByEmail.get(sub.email) ?? [];
    existing.push(sub);
    subscribersByEmail.set(sub.email, existing);
  }

  const eventCreates: Promise<unknown>[] = [];
  for (const email of recipients) {
    const emailSubs = subscribersByEmail.get(email) ?? [];
    for (const sub of emailSubs) {
      const campaign = campaignByListId.get(sub.listId);
      if (campaign) {
        eventCreates.push(
          prisma.emailEvent.create({
            data: {
              type: "DELIVERED",
              campaignId: campaign.id,
              metadata: { email },
            },
          })
        );
      }
    }
  }
  await Promise.all(eventCreates);

  return { action: "delivery_processed", count: recipients.length };
}

// ---------------------------------------------------------------------------
// Unsubscribe handler
// ---------------------------------------------------------------------------

/**
 * Process an unsubscribe request from an email link.
 */
export async function handleUnsubscribe(
  campaignId: string,
  email: string
): Promise<void> {
  // Find the campaign to get the list
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) return;

  // Unsubscribe from the specific list
  await prisma.emailSubscriber.updateMany({
    where: { email, listId: campaign.listId },
    data: { status: "UNSUBSCRIBED" },
  });

  // Record unsubscribe event
  await prisma.emailEvent.create({
    data: {
      type: "UNSUBSCRIBED",
      campaignId,
      metadata: { email },
    },
  });
}

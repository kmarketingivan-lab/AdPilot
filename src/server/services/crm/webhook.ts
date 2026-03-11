import { createHmac, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { webhookDeliveryQueue } from "@/server/queue/queues";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebhookEvent =
  | "contact.created"
  | "contact.updated"
  | "contact.deleted"
  | "deal.won"
  | "deal.lost"
  | "deal.created"
  | "deal.updated"
  | "note.created"
  | "stage.changed"
  | "score.updated"
  | "import.completed";

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  workspaceId: string;
  data: Record<string, unknown>;
}

export interface WebhookRegistration {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryResult {
  webhookId: string;
  deliveryId: string;
  statusCode: number | null;
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// HMAC signature
// ---------------------------------------------------------------------------

/**
 * Compute HMAC-SHA256 signature for a payload using the webhook's secret.
 */
export function computeSignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

/**
 * Verify a webhook signature against an expected payload.
 */
export function verifySignature(
  payload: string,
  secret: string,
  signature: string,
): boolean {
  const expected = computeSignature(payload, secret);
  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

// ---------------------------------------------------------------------------
// Webhook registration
// ---------------------------------------------------------------------------

/**
 * Register a new webhook endpoint for a workspace.
 * Generates a signing secret, encrypts it, and stores it.
 */
export async function registerWebhook(input: {
  url: string;
  events: WebhookEvent[];
  workspaceId: string;
}): Promise<WebhookRegistration & { secret: string }> {
  // Validate URL
  try {
    const parsed = new URL(input.url);
    if (!["https:", "http:"].includes(parsed.protocol)) {
      throw new Error("URL must use http or https protocol");
    }
  } catch {
    throw new Error("Invalid webhook URL");
  }

  // Generate a random signing secret
  const rawSecret = randomBytes(32).toString("hex");
  const encryptedSecret = encrypt(rawSecret);

  const webhook = await prisma.webhook.create({
    data: {
      url: input.url,
      events: input.events,
      secret: encryptedSecret,
      workspaceId: input.workspaceId,
    },
  });

  return {
    id: webhook.id,
    url: webhook.url,
    events: webhook.events,
    active: webhook.active,
    workspaceId: webhook.workspaceId,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
    // Return raw secret only on creation so the user can store it
    secret: rawSecret,
  };
}

/**
 * Update a webhook's URL, events, or active status.
 */
export async function updateWebhook(input: {
  webhookId: string;
  workspaceId: string;
  url?: string;
  events?: WebhookEvent[];
  active?: boolean;
}): Promise<WebhookRegistration> {
  const webhook = await prisma.webhook.findUnique({
    where: { id: input.webhookId },
  });

  if (!webhook || webhook.workspaceId !== input.workspaceId) {
    throw new Error("Webhook not found");
  }

  if (input.url) {
    try {
      const parsed = new URL(input.url);
      if (!["https:", "http:"].includes(parsed.protocol)) {
        throw new Error("URL must use http or https protocol");
      }
    } catch {
      throw new Error("Invalid webhook URL");
    }
  }

  const updated = await prisma.webhook.update({
    where: { id: input.webhookId },
    data: {
      ...(input.url !== undefined && { url: input.url }),
      ...(input.events !== undefined && { events: input.events }),
      ...(input.active !== undefined && { active: input.active }),
    },
  });

  return {
    id: updated.id,
    url: updated.url,
    events: updated.events,
    active: updated.active,
    workspaceId: updated.workspaceId,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

/**
 * Delete a webhook and all its delivery records.
 */
export async function deleteWebhook(
  webhookId: string,
  workspaceId: string,
): Promise<void> {
  const webhook = await prisma.webhook.findUnique({
    where: { id: webhookId },
  });

  if (!webhook || webhook.workspaceId !== workspaceId) {
    throw new Error("Webhook not found");
  }

  await prisma.webhook.delete({ where: { id: webhookId } });
}

/**
 * List all webhooks for a workspace.
 */
export async function listWebhooks(workspaceId: string): Promise<WebhookRegistration[]> {
  const webhooks = await prisma.webhook.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });

  return webhooks.map((w) => ({
    id: w.id,
    url: w.url,
    events: w.events,
    active: w.active,
    workspaceId: w.workspaceId,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  }));
}

/**
 * Get recent deliveries for a webhook (for debugging).
 */
export async function getDeliveries(
  webhookId: string,
  workspaceId: string,
  limit = 20,
): Promise<{
  id: string;
  event: string;
  statusCode: number | null;
  error: string | null;
  attempts: number;
  deliveredAt: Date | null;
  createdAt: Date;
}[]> {
  const webhook = await prisma.webhook.findUnique({
    where: { id: webhookId },
  });

  if (!webhook || webhook.workspaceId !== workspaceId) {
    throw new Error("Webhook not found");
  }

  return prisma.webhookDelivery.findMany({
    where: { webhookId },
    select: {
      id: true,
      event: true,
      statusCode: true,
      error: true,
      attempts: true,
      deliveredAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// ---------------------------------------------------------------------------
// Webhook firing (queue-based)
// ---------------------------------------------------------------------------

/**
 * Fire webhooks for a given event in a workspace.
 * Finds all active webhooks subscribed to this event and enqueues delivery jobs.
 */
export async function fireWebhooks(
  event: WebhookEvent,
  workspaceId: string,
  data: Record<string, unknown>,
): Promise<number> {
  const webhooks = await prisma.webhook.findMany({
    where: {
      workspaceId,
      active: true,
      events: { has: event },
    },
  });

  if (webhooks.length === 0) return 0;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    workspaceId,
    data,
  };

  let enqueued = 0;

  for (const webhook of webhooks) {
    // Create a delivery record
    const delivery = await prisma.webhookDelivery.create({
      data: {
        event,
        payload: JSON.parse(JSON.stringify(payload)),
        webhookId: webhook.id,
      },
    });

    // Enqueue the delivery job
    await webhookDeliveryQueue.add(
      "deliver",
      {
        deliveryId: delivery.id,
        webhookId: webhook.id,
        url: webhook.url,
        encryptedSecret: webhook.secret,
        payload,
      },
      {
        jobId: `webhook-${delivery.id}`,
      },
    );

    enqueued++;
  }

  return enqueued;
}

// ---------------------------------------------------------------------------
// Delivery execution (called by the BullMQ worker)
// ---------------------------------------------------------------------------

export interface WebhookDeliveryJobData {
  deliveryId: string;
  webhookId: string;
  url: string;
  encryptedSecret: string;
  payload: WebhookPayload;
}

/**
 * Execute a single webhook delivery.
 * This function is designed to be called from a BullMQ worker processor.
 */
export async function executeDelivery(job: WebhookDeliveryJobData): Promise<DeliveryResult> {
  const { deliveryId, webhookId, url, encryptedSecret, payload } = job;

  const payloadJson = JSON.stringify(payload);
  const secret = decrypt(encryptedSecret);
  const signature = computeSignature(payloadJson, secret);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": payload.event,
        "X-Webhook-Delivery": deliveryId,
        "User-Agent": "AdPilot-Webhooks/1.0",
      },
      body: payloadJson,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseBody = await response.text().catch(() => "");
    const statusCode = response.status;
    const success = statusCode >= 200 && statusCode < 300;

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        statusCode,
        response: responseBody.slice(0, 2000),
        attempts: { increment: 1 },
        ...(success && { deliveredAt: new Date() }),
        ...(!success && { error: `HTTP ${statusCode}` }),
      },
    });

    if (!success) {
      throw new Error(`Webhook returned HTTP ${statusCode}`);
    }

    return { webhookId, deliveryId, statusCode, success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        attempts: { increment: 1 },
        error: message.slice(0, 2000),
      },
    });

    // Re-throw so BullMQ retries with exponential backoff
    throw error;
  }
}

/**
 * Rotate the signing secret for a webhook.
 * Returns the new raw secret (displayed once to the user).
 */
export async function rotateSecret(
  webhookId: string,
  workspaceId: string,
): Promise<string> {
  const webhook = await prisma.webhook.findUnique({
    where: { id: webhookId },
  });

  if (!webhook || webhook.workspaceId !== workspaceId) {
    throw new Error("Webhook not found");
  }

  const rawSecret = randomBytes(32).toString("hex");
  const encryptedSecret = encrypt(rawSecret);

  await prisma.webhook.update({
    where: { id: webhookId },
    data: { secret: encryptedSecret },
  });

  return rawSecret;
}

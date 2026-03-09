import { Queue } from "bullmq";
import { redisConnection } from "./connection";

// Dead letter queue for manual inspection of permanently failed jobs
export const deadLetterQueue = new Queue("dead-letter", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: false,
    removeOnFail: false,
  },
});

// Social media post publishing
export const socialPublishQueue = new Queue("social-publish", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: false,
  },
});

// Token refresh (repeatable every 8h)
export const tokenRefreshQueue = new Queue("token-refresh", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 10000 },
    removeOnComplete: { count: 50 },
    removeOnFail: false,
  },
});

// Analytics data sync (repeatable every 6h)
export const analyticsSyncQueue = new Queue("analytics-sync", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 15000 },
    removeOnComplete: { count: 50 },
    removeOnFail: false,
  },
});

// Email sending
export const emailSendQueue = new Queue("email-send", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: { count: 200 },
    removeOnFail: false,
  },
});

// Report generation
export const reportGenerateQueue = new Queue("report-generate", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: { count: 50 },
    removeOnFail: false,
  },
});

// Webhook delivery
export const webhookDeliveryQueue = new Queue("webhook-delivery", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail: false,
  },
});

// Email A/B test evaluation (delayed job to pick winner)
export const emailAbTestQueue = new Queue("email-ab-test", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 30000 },
    removeOnComplete: { count: 50 },
    removeOnFail: false,
  },
});

// Email automation workflow execution
export const emailAutomationQueue = new Queue("email-automation", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail: false,
  },
});

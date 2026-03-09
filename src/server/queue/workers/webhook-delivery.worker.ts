import { Worker } from "bullmq";
import { redisConnection } from "../connection";
import {
  executeDelivery,
  type WebhookDeliveryJobData,
} from "@/server/services/crm/webhook";

export const webhookDeliveryWorker = new Worker<WebhookDeliveryJobData>(
  "webhook-delivery",
  async (job) => {
    await executeDelivery(job.data);
  },
  {
    connection: redisConnection,
    concurrency: 10,
    limiter: {
      max: 50,
      duration: 1000,
    },
  },
);

webhookDeliveryWorker.on("failed", (job, err) => {
  console.error(
    `[webhook-delivery] Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`,
  );
});

webhookDeliveryWorker.on("completed", (job) => {
  console.log(`[webhook-delivery] Job ${job.id} completed`);
});

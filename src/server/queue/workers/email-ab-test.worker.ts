import { Worker } from "bullmq";
import { redisConnection } from "../connection";
import {
  evaluateAndSendWinner,
  type ABTestJobData,
} from "@/server/services/email/ab-test";

export const emailAbTestWorker = new Worker<ABTestJobData>(
  "email-ab-test",
  async (job) => {
    const result = await evaluateAndSendWinner(job.data);
    console.log(
      `[email-ab-test] Campaign ${job.data.campaignId}: winner=${result.winner}, ` +
        `openRateA=${(result.openRateA * 100).toFixed(1)}%, ` +
        `openRateB=${(result.openRateB * 100).toFixed(1)}%, ` +
        `sentToRemaining=${result.sentToRemaining}`,
    );
    return result;
  },
  {
    connection: redisConnection,
    concurrency: 2,
  },
);

emailAbTestWorker.on("failed", (job, err) => {
  console.error(
    `[email-ab-test] Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`,
  );
});

emailAbTestWorker.on("completed", (job) => {
  console.log(`[email-ab-test] Job ${job.id} completed`);
});

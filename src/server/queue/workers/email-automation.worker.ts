import { Worker } from "bullmq";
import { redisConnection } from "../connection";
import {
  executeNode,
  type AutomationJobData,
} from "@/server/services/email/automation-engine";

export const emailAutomationWorker = new Worker<AutomationJobData>(
  "email-automation",
  async (job) => {
    await executeNode(job.data);
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

emailAutomationWorker.on("failed", (job, err) => {
  console.error(
    `[email-automation] Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`,
  );
});

emailAutomationWorker.on("completed", (job) => {
  console.log(
    `[email-automation] Job ${job.id} completed — automation=${job.data.automationId}, node=${job.data.currentNodeId}`,
  );
});

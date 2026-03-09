import { prisma } from "@/lib/prisma";
import { emailSendQueue, emailAutomationQueue } from "@/server/queue/queues";
import { renderTemplate } from "./ses";

// ---------------------------------------------------------------------------
// Workflow JSON types
// ---------------------------------------------------------------------------

export type TriggerType =
  | "formSubmitted"
  | "tagAdded"
  | "stageChanged"
  | "emailOpened"
  | "contactCreated";

export type NodeType =
  | "trigger"
  | "condition"
  | "sendEmail"
  | "wait"
  | "addTag"
  | "changeStage"
  | "webhook";

export interface WorkflowNode {
  id: string;
  type: NodeType;
  data: Record<string, unknown>;
  /** IDs of nodes that follow this one */
  nextNodes: string[];
  /** For condition nodes: ID of the "false" branch */
  falseNode?: string;
  position: { x: number; y: number };
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  /** The ID of the entry trigger node */
  entryNodeId: string;
}

export interface AutomationJobData {
  automationId: string;
  contactId: string;
  currentNodeId: string;
  workspaceId: string;
  /** Accumulated execution log entries */
  executionId: string;
}

export interface ExecutionLogEntry {
  nodeId: string;
  nodeType: NodeType;
  status: "completed" | "failed" | "skipped";
  message?: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Trigger processing — entry point when an event happens
// ---------------------------------------------------------------------------

/**
 * Called when an event occurs (e.g. contact created, tag added).
 * Finds all active automations with matching triggers and starts execution.
 */
export async function processTrigger(
  workspaceId: string,
  triggerType: TriggerType,
  contactId: string,
  triggerData?: Record<string, unknown>,
) {
  // Find active automations in this workspace
  const automations = await prisma.emailAutomation.findMany({
    where: {
      workspaceId,
      active: true,
    },
  });

  const matched: string[] = [];

  for (const automation of automations) {
    const trigger = automation.trigger as Record<string, unknown>;
    if (trigger.type !== triggerType) continue;

    // Check additional trigger conditions
    if (triggerType === "tagAdded" && trigger.tag) {
      if (triggerData?.tag !== trigger.tag) continue;
    }
    if (triggerType === "stageChanged" && trigger.stage) {
      if (triggerData?.stage !== trigger.stage) continue;
    }
    if (triggerType === "formSubmitted" && trigger.formId) {
      if (triggerData?.formId !== trigger.formId) continue;
    }

    // Start execution
    const steps = automation.steps as unknown as WorkflowDefinition;
    if (!steps?.entryNodeId || !steps?.nodes?.length) continue;

    // Create execution record
    const execution = await prisma.$executeRaw`
      INSERT INTO "EmailAutomation" (id, name, trigger, steps, active, "workspaceId", "createdAt", "updatedAt")
      VALUES (${automation.id}, ${automation.name}, ${JSON.stringify(automation.trigger)}::jsonb, ${JSON.stringify(automation.steps)}::jsonb, ${automation.active}, ${automation.workspaceId}, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `.catch(() => null);

    // We store execution tracking in activity logs
    const executionId = `exec_${automation.id}_${contactId}_${Date.now()}`;

    // Log start
    await logExecution(contactId, automation.id, executionId, {
      nodeId: steps.entryNodeId,
      nodeType: "trigger",
      status: "completed",
      message: `Trigger '${triggerType}' fired`,
      timestamp: new Date().toISOString(),
    });

    // Find entry node and proceed to its next nodes
    const entryNode = steps.nodes.find((n) => n.id === steps.entryNodeId);
    if (!entryNode || !entryNode.nextNodes.length) continue;

    // Enqueue first action node
    for (const nextNodeId of entryNode.nextNodes) {
      await emailAutomationQueue.add(`auto-${executionId}-${nextNodeId}`, {
        automationId: automation.id,
        contactId,
        currentNodeId: nextNodeId,
        workspaceId,
        executionId,
      } satisfies AutomationJobData);
    }

    matched.push(automation.id);
  }

  return { matchedAutomations: matched.length, automationIds: matched };
}

// ---------------------------------------------------------------------------
// Node execution — called by the BullMQ worker
// ---------------------------------------------------------------------------

/**
 * Execute a single workflow node for a specific contact.
 * Returns the IDs of the next nodes to process (if any).
 */
export async function executeNode(data: AutomationJobData): Promise<void> {
  const { automationId, contactId, currentNodeId, workspaceId, executionId } =
    data;

  // Load the automation workflow
  const automation = await prisma.emailAutomation.findUnique({
    where: { id: automationId },
  });

  if (!automation || !automation.active) return;

  const workflow = automation.steps as unknown as WorkflowDefinition;
  const node = workflow.nodes.find((n) => n.id === currentNodeId);
  if (!node) return;

  // Load contact data
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
  });
  if (!contact) return;

  let nextNodeIds: string[] = [];

  try {
    switch (node.type) {
      case "sendEmail": {
        await executeSendEmail(node, contact, data.automationId);
        nextNodeIds = node.nextNodes;
        await logExecution(contactId, automationId, executionId, {
          nodeId: currentNodeId,
          nodeType: "sendEmail",
          status: "completed",
          message: `Email sent: ${(node.data.subject as string) ?? "No subject"}`,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      case "wait": {
        const delayMs = resolveDelay(node.data);
        // Re-enqueue with delay for next nodes
        for (const nextId of node.nextNodes) {
          await emailAutomationQueue.add(
            `auto-${executionId}-${nextId}`,
            {
              automationId,
              contactId,
              currentNodeId: nextId,
              workspaceId,
              executionId,
            } satisfies AutomationJobData,
            { delay: delayMs },
          );
        }
        await logExecution(contactId, automationId, executionId, {
          nodeId: currentNodeId,
          nodeType: "wait",
          status: "completed",
          message: `Waiting ${delayMs}ms`,
          timestamp: new Date().toISOString(),
        });
        return; // Don't continue to nextNodes below — they're already delayed
      }

      case "condition": {
        const passes = evaluateCondition(node.data, contact);
        if (passes) {
          nextNodeIds = node.nextNodes;
        } else if (node.falseNode) {
          nextNodeIds = [node.falseNode];
        }
        await logExecution(contactId, automationId, executionId, {
          nodeId: currentNodeId,
          nodeType: "condition",
          status: "completed",
          message: `Condition evaluated: ${passes ? "true" : "false"}`,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      case "addTag": {
        const tag = node.data.tag as string;
        if (tag) {
          const existingTags = contact.tags ?? [];
          if (!existingTags.includes(tag)) {
            await prisma.contact.update({
              where: { id: contactId },
              data: { tags: [...existingTags, tag] },
            });
          }
        }
        nextNodeIds = node.nextNodes;
        await logExecution(contactId, automationId, executionId, {
          nodeId: currentNodeId,
          nodeType: "addTag",
          status: "completed",
          message: `Tag added: ${node.data.tag}`,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      case "changeStage": {
        const stage = node.data.stage as string;
        if (stage) {
          await prisma.contact.update({
            where: { id: contactId },
            data: { stage: stage as any },
          });
          // Log activity
          await prisma.activity.create({
            data: {
              type: "STAGE_CHANGE",
              description: `Stage changed to ${stage} by automation`,
              contactId,
              metadata: { automationId, fromStage: contact.stage, toStage: stage },
            },
          });
        }
        nextNodeIds = node.nextNodes;
        await logExecution(contactId, automationId, executionId, {
          nodeId: currentNodeId,
          nodeType: "changeStage",
          status: "completed",
          message: `Stage changed to ${stage}`,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      case "webhook": {
        const url = node.data.url as string;
        if (url) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
          try {
            const response = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({
                automationId,
                contactId,
                contact: {
                  email: contact.email,
                  firstName: contact.firstName,
                  lastName: contact.lastName,
                  tags: contact.tags,
                  stage: contact.stage,
                },
                nodeId: currentNodeId,
                timestamp: new Date().toISOString(),
              }),
            });
            if (!response.ok) {
              console.warn(`[automation-engine] Webhook to ${url} returned ${response.status}`);
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[automation-engine] Webhook to ${url} failed: ${message}`);
            // Log the failure but don't crash the workflow
            await logExecution(contactId, automationId, executionId, {
              nodeId: currentNodeId,
              nodeType: "webhook",
              status: "failed",
              message: `Webhook failed: ${message}`,
              timestamp: new Date().toISOString(),
            });
          } finally {
            clearTimeout(timeout);
          }
        }
        nextNodeIds = node.nextNodes;
        await logExecution(contactId, automationId, executionId, {
          nodeId: currentNodeId,
          nodeType: "webhook",
          status: "completed",
          message: `Webhook sent to ${url}`,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      default:
        nextNodeIds = node.nextNodes;
    }
  } catch (error) {
    await logExecution(contactId, automationId, executionId, {
      nodeId: currentNodeId,
      nodeType: node.type,
      status: "failed",
      message: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
    throw error; // Let BullMQ retry
  }

  // Enqueue next nodes
  for (const nextId of nextNodeIds) {
    await emailAutomationQueue.add(
      `auto-${executionId}-${nextId}`,
      {
        automationId,
        contactId,
        currentNodeId: nextId,
        workspaceId,
        executionId,
      } satisfies AutomationJobData,
    );
  }
}

// ---------------------------------------------------------------------------
// Node executors
// ---------------------------------------------------------------------------

async function executeSendEmail(
  node: WorkflowNode,
  contact: { id: string; email: string; firstName?: string | null; lastName?: string | null },
  automationId: string,
) {
  const subject = (node.data.subject as string) ?? "No Subject";
  const html = (node.data.htmlContent as string) ?? "<p></p>";
  const campaignId = node.data.campaignId as string | undefined;

  const rendered = renderTemplate(html, {
    email: contact.email,
    firstName: contact.firstName ?? "",
    lastName: contact.lastName ?? "",
  });

  await emailSendQueue.add(`automation-email-${contact.id}-${node.id}`, {
    to: contact.email,
    subject,
    html: rendered,
    campaignId: campaignId ?? `automation_${automationId}`,
    contactId: contact.id,
  });
}

function resolveDelay(data: Record<string, unknown>): number {
  const amount = (data.amount as number) ?? 1;
  const unit = (data.unit as string) ?? "hours";

  const multipliers: Record<string, number> = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
  };

  return amount * (multipliers[unit] ?? multipliers.hours);
}

function evaluateCondition(
  data: Record<string, unknown>,
  contact: Record<string, unknown>,
): boolean {
  const field = data.field as string;
  const operator = data.operator as string;
  const value = data.value;

  if (!field || !operator) return false;

  const contactValue = contact[field];

  switch (operator) {
    case "equals":
      return contactValue === value;
    case "not_equals":
      return contactValue !== value;
    case "contains":
      if (Array.isArray(contactValue)) {
        return contactValue.includes(value);
      }
      return String(contactValue ?? "").includes(String(value));
    case "not_contains":
      if (Array.isArray(contactValue)) {
        return !contactValue.includes(value);
      }
      return !String(contactValue ?? "").includes(String(value));
    case "greater_than":
      return Number(contactValue) > Number(value);
    case "less_than":
      return Number(contactValue) < Number(value);
    case "is_set":
      return contactValue != null && contactValue !== "";
    case "is_not_set":
      return contactValue == null || contactValue === "";
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Execution logging
// ---------------------------------------------------------------------------

async function logExecution(
  contactId: string,
  automationId: string,
  executionId: string,
  entry: ExecutionLogEntry,
) {
  await prisma.activity.create({
    data: {
      type: "EMAIL_SENT",
      description: `[Automation] ${entry.nodeType}: ${entry.message}`,
      contactId,
      metadata: {
        automationId,
        executionId,
        nodeId: entry.nodeId,
        nodeType: entry.nodeType,
        status: entry.status,
      },
    },
  });
}

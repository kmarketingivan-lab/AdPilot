import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types — Segment Definition DSL
// ---------------------------------------------------------------------------

export type FieldOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "not_in"
  | "between"
  | "is_set"
  | "is_not_set";

export interface FieldCondition {
  field: string;
  operator: FieldOperator;
  value?: string | number | boolean | string[] | [number, number];
}

export interface ConditionGroup {
  logic: "AND" | "OR";
  conditions: (FieldCondition | ConditionGroup)[];
}

export interface SegmentDefinition {
  logic: "AND" | "OR";
  conditions: (FieldCondition | ConditionGroup)[];
}

export interface SegmentWithCount {
  id: string;
  name: string;
  description: string | null;
  definition: SegmentDefinition;
  contactCount: number;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Allowed filterable fields on the Contact model
// ---------------------------------------------------------------------------

const STRING_FIELDS = new Set([
  "email", "firstName", "lastName", "phone", "company", "jobTitle",
]);

const ENUM_FIELDS = new Set(["source", "stage"]);
const NUMBER_FIELDS = new Set(["score"]);
const ARRAY_FIELDS = new Set(["tags"]);
const DATE_FIELDS = new Set(["createdAt", "updatedAt"]);

// ---------------------------------------------------------------------------
// Condition → Prisma where clause translation
// ---------------------------------------------------------------------------

function isConditionGroup(c: FieldCondition | ConditionGroup): c is ConditionGroup {
  return "logic" in c && "conditions" in c && !("field" in c);
}

function buildFieldWhere(condition: FieldCondition): Prisma.ContactWhereInput {
  const { field, operator, value } = condition;

  // is_set / is_not_set — no value needed
  if (operator === "is_set") {
    return { [field]: { not: null } };
  }
  if (operator === "is_not_set") {
    return { [field]: null };
  }

  // String fields
  if (STRING_FIELDS.has(field)) {
    switch (operator) {
      case "equals":
        return { [field]: { equals: value as string, mode: "insensitive" } };
      case "not_equals":
        return { [field]: { not: { equals: value as string, mode: "insensitive" } } };
      case "contains":
        return { [field]: { contains: value as string, mode: "insensitive" } };
      case "not_contains":
        return { NOT: { [field]: { contains: value as string, mode: "insensitive" } } };
      case "starts_with":
        return { [field]: { startsWith: value as string, mode: "insensitive" } };
      case "ends_with":
        return { [field]: { endsWith: value as string, mode: "insensitive" } };
      case "in":
        return { [field]: { in: value as string[] } };
      case "not_in":
        return { [field]: { notIn: value as string[] } };
      default:
        throw new Error(`Operator "${operator}" not supported for string field "${field}"`);
    }
  }

  // Enum fields (exact match semantics)
  if (ENUM_FIELDS.has(field)) {
    switch (operator) {
      case "equals":
        return { [field]: value as string };
      case "not_equals":
        return { [field]: { not: value as string } };
      case "in":
        return { [field]: { in: value as string[] } };
      case "not_in":
        return { [field]: { notIn: value as string[] } };
      default:
        throw new Error(`Operator "${operator}" not supported for enum field "${field}"`);
    }
  }

  // Number fields
  if (NUMBER_FIELDS.has(field)) {
    switch (operator) {
      case "equals":
        return { [field]: { equals: value as number } };
      case "not_equals":
        return { [field]: { not: value as number } };
      case "gt":
        return { [field]: { gt: value as number } };
      case "gte":
        return { [field]: { gte: value as number } };
      case "lt":
        return { [field]: { lt: value as number } };
      case "lte":
        return { [field]: { lte: value as number } };
      case "between": {
        const [min, max] = value as [number, number];
        return { [field]: { gte: min, lte: max } };
      }
      default:
        throw new Error(`Operator "${operator}" not supported for number field "${field}"`);
    }
  }

  // Array fields (tags)
  if (ARRAY_FIELDS.has(field)) {
    switch (operator) {
      case "contains":
        // "has" checks if array contains the value
        return { [field]: { has: value as string } };
      case "in":
        // "hasSome" checks if array contains any of the values
        return { [field]: { hasSome: value as string[] } };
      case "equals":
        // "hasEvery" checks if array contains all values
        return { [field]: { hasEvery: value as string[] } };
      default:
        throw new Error(`Operator "${operator}" not supported for array field "${field}"`);
    }
  }

  // Date fields
  if (DATE_FIELDS.has(field)) {
    switch (operator) {
      case "gt":
        return { [field]: { gt: new Date(value as string) } };
      case "gte":
        return { [field]: { gte: new Date(value as string) } };
      case "lt":
        return { [field]: { lt: new Date(value as string) } };
      case "lte":
        return { [field]: { lte: new Date(value as string) } };
      case "between": {
        const [start, end] = value as [string, string] & [number, number];
        return { [field]: { gte: new Date(start), lte: new Date(end) } };
      }
      case "equals":
        return { [field]: { equals: new Date(value as string) } };
      default:
        throw new Error(`Operator "${operator}" not supported for date field "${field}"`);
    }
  }

  throw new Error(`Unknown field "${field}"`);
}

function buildGroupWhere(group: ConditionGroup | SegmentDefinition): Prisma.ContactWhereInput {
  const clauses: Prisma.ContactWhereInput[] = group.conditions.map((condition) => {
    if (isConditionGroup(condition)) {
      return buildGroupWhere(condition);
    }
    return buildFieldWhere(condition);
  });

  if (group.logic === "OR") {
    return { OR: clauses };
  }
  return { AND: clauses };
}

/**
 * Convert a segment definition into a Prisma where clause.
 * Scoped to the given workspace.
 */
export function buildSegmentWhere(
  definition: SegmentDefinition,
  workspaceId: string,
): Prisma.ContactWhereInput {
  const segmentWhere = buildGroupWhere(definition);
  return {
    AND: [{ workspaceId }, segmentWhere],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new segment and compute its initial contact count.
 */
export async function createSegment(input: {
  name: string;
  description?: string;
  definition: SegmentDefinition;
  workspaceId: string;
}): Promise<SegmentWithCount> {
  const where = buildSegmentWhere(input.definition, input.workspaceId);
  const contactCount = await prisma.contact.count({ where });

  const segment = await prisma.segment.create({
    data: {
      name: input.name,
      description: input.description,
      definition: input.definition as unknown as Prisma.JsonObject,
      contactCount,
      workspaceId: input.workspaceId,
    },
  });

  return {
    ...segment,
    definition: segment.definition as unknown as SegmentDefinition,
  };
}

/**
 * Update a segment's definition and recompute its contact count.
 */
export async function updateSegment(input: {
  segmentId: string;
  workspaceId: string;
  name?: string;
  description?: string;
  definition?: SegmentDefinition;
}): Promise<SegmentWithCount> {
  const existing = await prisma.segment.findUnique({
    where: { id: input.segmentId },
  });

  if (!existing || existing.workspaceId !== input.workspaceId) {
    throw new Error("Segment not found");
  }

  const definition = input.definition
    ? input.definition
    : (existing.definition as unknown as SegmentDefinition);

  const where = buildSegmentWhere(definition, input.workspaceId);
  const contactCount = await prisma.contact.count({ where });

  const segment = await prisma.segment.update({
    where: { id: input.segmentId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.definition !== undefined && {
        definition: input.definition as unknown as Prisma.JsonObject,
      }),
      contactCount,
    },
  });

  return {
    ...segment,
    definition: segment.definition as unknown as SegmentDefinition,
  };
}

/**
 * Evaluate a segment and return matching contact IDs.
 */
export async function evaluateSegment(
  segmentId: string,
  workspaceId: string,
  options?: { page?: number; perPage?: number },
): Promise<{ contactIds: string[]; total: number }> {
  const segment = await prisma.segment.findUnique({
    where: { id: segmentId },
  });

  if (!segment || segment.workspaceId !== workspaceId) {
    throw new Error("Segment not found");
  }

  const definition = segment.definition as unknown as SegmentDefinition;
  const where = buildSegmentWhere(definition, workspaceId);

  const page = options?.page ?? 1;
  const perPage = options?.perPage ?? 100;

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      select: { id: true },
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: "desc" },
    }),
    prisma.contact.count({ where }),
  ]);

  // Update cached count
  if (segment.contactCount !== total) {
    await prisma.segment.update({
      where: { id: segmentId },
      data: { contactCount: total },
    });
  }

  return {
    contactIds: contacts.map((c) => c.id),
    total,
  };
}

/**
 * Preview a segment definition without saving — returns matching count and sample contacts.
 */
export async function previewSegment(
  definition: SegmentDefinition,
  workspaceId: string,
  limit = 10,
): Promise<{ total: number; sample: { id: string; email: string; firstName: string | null; lastName: string | null }[] }> {
  const where = buildSegmentWhere(definition, workspaceId);

  const [total, sample] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      select: { id: true, email: true, firstName: true, lastName: true },
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { total, sample };
}

/**
 * Delete a segment.
 */
export async function deleteSegment(segmentId: string, workspaceId: string): Promise<void> {
  const segment = await prisma.segment.findUnique({
    where: { id: segmentId },
  });

  if (!segment || segment.workspaceId !== workspaceId) {
    throw new Error("Segment not found");
  }

  await prisma.segment.delete({ where: { id: segmentId } });
}

/**
 * List all segments for a workspace.
 */
export async function listSegments(workspaceId: string): Promise<SegmentWithCount[]> {
  const segments = await prisma.segment.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });

  return segments.map((s) => ({
    ...s,
    definition: s.definition as unknown as SegmentDefinition,
  }));
}

/**
 * Refresh the cached contact count for a segment.
 */
export async function refreshSegmentCount(segmentId: string, workspaceId: string): Promise<number> {
  const segment = await prisma.segment.findUnique({
    where: { id: segmentId },
  });

  if (!segment || segment.workspaceId !== workspaceId) {
    throw new Error("Segment not found");
  }

  const definition = segment.definition as unknown as SegmentDefinition;
  const where = buildSegmentWhere(definition, workspaceId);
  const count = await prisma.contact.count({ where });

  await prisma.segment.update({
    where: { id: segmentId },
    data: { contactCount: count },
  });

  return count;
}

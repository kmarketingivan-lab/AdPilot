import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    segment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  buildSegmentWhere,
  createSegment,
  evaluateSegment,
  previewSegment,
  type SegmentDefinition,
  type FieldCondition,
  type ConditionGroup,
} from "@/server/services/crm/segmentation";

const mockedPrisma = vi.mocked(prisma);

describe("segmentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // buildSegmentWhere — AND conditions
  // ---------------------------------------------------------------------------

  describe("buildSegmentWhere — AND conditions", () => {
    it("should build AND clause for multiple string conditions", () => {
      const definition: SegmentDefinition = {
        logic: "AND",
        conditions: [
          { field: "email", operator: "contains", value: "@gmail.com" },
          { field: "company", operator: "equals", value: "Acme" },
        ],
      };

      const where = buildSegmentWhere(definition, "ws-1");

      expect(where.AND).toBeDefined();
      const andClauses = where.AND as any[];
      expect(andClauses).toHaveLength(2);
      // First is workspaceId filter, second is the segment WHERE
      expect(andClauses[0]).toEqual({ workspaceId: "ws-1" });
    });

    it("should handle is_set / is_not_set operators", () => {
      const definition: SegmentDefinition = {
        logic: "AND",
        conditions: [
          { field: "phone", operator: "is_set" },
          { field: "jobTitle", operator: "is_not_set" },
        ],
      };

      const where = buildSegmentWhere(definition, "ws-1");

      expect(where).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // buildSegmentWhere — OR conditions
  // ---------------------------------------------------------------------------

  describe("buildSegmentWhere — OR conditions", () => {
    it("should build OR clause for multiple conditions", () => {
      const definition: SegmentDefinition = {
        logic: "OR",
        conditions: [
          { field: "stage", operator: "equals", value: "MQL" },
          { field: "stage", operator: "equals", value: "SQL" },
        ],
      };

      const where = buildSegmentWhere(definition, "ws-1");

      expect(where.AND).toBeDefined();
      const andClauses = where.AND as any[];
      // The second element should contain OR
      expect(andClauses[1].OR).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // buildSegmentWhere — operators
  // ---------------------------------------------------------------------------

  describe("buildSegmentWhere — operators", () => {
    it("should handle number operators (gt, gte, lt, lte, between)", () => {
      const gtDef: SegmentDefinition = {
        logic: "AND",
        conditions: [{ field: "score", operator: "gt", value: 50 }],
      };

      const where = buildSegmentWhere(gtDef, "ws-1");
      expect(where).toBeDefined();

      const betweenDef: SegmentDefinition = {
        logic: "AND",
        conditions: [{ field: "score", operator: "between", value: [20, 80] }],
      };

      const betweenWhere = buildSegmentWhere(betweenDef, "ws-1");
      expect(betweenWhere).toBeDefined();
    });

    it("should handle string operators (contains, starts_with, ends_with)", () => {
      const def: SegmentDefinition = {
        logic: "AND",
        conditions: [
          { field: "email", operator: "starts_with", value: "admin" },
          { field: "email", operator: "ends_with", value: ".com" },
        ],
      };

      const where = buildSegmentWhere(def, "ws-1");
      expect(where).toBeDefined();
    });

    it("should handle enum field operators (in, not_in)", () => {
      const def: SegmentDefinition = {
        logic: "AND",
        conditions: [
          { field: "source", operator: "in", value: ["ORGANIC", "REFERRAL"] },
        ],
      };

      const where = buildSegmentWhere(def, "ws-1");
      expect(where).toBeDefined();
    });

    it("should handle array field (tags) operators", () => {
      const def: SegmentDefinition = {
        logic: "AND",
        conditions: [
          { field: "tags", operator: "contains", value: "vip" },
        ],
      };

      const where = buildSegmentWhere(def, "ws-1");
      expect(where).toBeDefined();
    });

    it("should throw for unsupported operator on a field type", () => {
      const def: SegmentDefinition = {
        logic: "AND",
        conditions: [
          { field: "email", operator: "gt", value: 50 },
        ],
      };

      expect(() => buildSegmentWhere(def, "ws-1")).toThrow(
        'Operator "gt" not supported for string field "email"'
      );
    });

    it("should throw for unknown field", () => {
      const def: SegmentDefinition = {
        logic: "AND",
        conditions: [
          { field: "unknownField", operator: "equals", value: "test" },
        ],
      };

      expect(() => buildSegmentWhere(def, "ws-1")).toThrow('Unknown field "unknownField"');
    });
  });

  // ---------------------------------------------------------------------------
  // buildSegmentWhere — nested groups
  // ---------------------------------------------------------------------------

  describe("buildSegmentWhere — nested groups", () => {
    it("should handle nested condition groups", () => {
      const definition: SegmentDefinition = {
        logic: "AND",
        conditions: [
          { field: "score", operator: "gte", value: 30 },
          {
            logic: "OR",
            conditions: [
              { field: "stage", operator: "equals", value: "MQL" },
              { field: "stage", operator: "equals", value: "SQL" },
            ],
          } as ConditionGroup,
        ],
      };

      const where = buildSegmentWhere(definition, "ws-1");
      expect(where).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // createSegment
  // ---------------------------------------------------------------------------

  describe("createSegment", () => {
    it("should create segment and compute initial count", async () => {
      mockedPrisma.contact.count.mockResolvedValue(42);
      mockedPrisma.segment.create.mockResolvedValue({
        id: "seg-1",
        name: "VIP Customers",
        description: null,
        definition: { logic: "AND", conditions: [] },
        contactCount: 42,
        workspaceId: "ws-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await createSegment({
        name: "VIP Customers",
        definition: { logic: "AND", conditions: [{ field: "score", operator: "gte", value: 80 }] },
        workspaceId: "ws-1",
      });

      expect(result.contactCount).toBe(42);
      expect(result.name).toBe("VIP Customers");
      expect(mockedPrisma.contact.count).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // evaluateSegment
  // ---------------------------------------------------------------------------

  describe("evaluateSegment", () => {
    it("should return contact IDs and total count", async () => {
      mockedPrisma.segment.findUnique.mockResolvedValue({
        id: "seg-1",
        workspaceId: "ws-1",
        definition: {
          logic: "AND",
          conditions: [{ field: "stage", operator: "equals", value: "MQL" }],
        },
        contactCount: 100,
      } as any);

      mockedPrisma.contact.findMany.mockResolvedValue([
        { id: "c1" },
        { id: "c2" },
      ] as any);
      mockedPrisma.contact.count.mockResolvedValue(50);
      mockedPrisma.segment.update.mockResolvedValue({} as any);

      const result = await evaluateSegment("seg-1", "ws-1");

      expect(result.contactIds).toEqual(["c1", "c2"]);
      expect(result.total).toBe(50);
    });

    it("should throw when segment not found", async () => {
      mockedPrisma.segment.findUnique.mockResolvedValue(null);

      await expect(evaluateSegment("invalid", "ws-1")).rejects.toThrow("Segment not found");
    });

    it("should throw when segment belongs to different workspace", async () => {
      mockedPrisma.segment.findUnique.mockResolvedValue({
        id: "seg-1",
        workspaceId: "ws-other",
      } as any);

      await expect(evaluateSegment("seg-1", "ws-1")).rejects.toThrow("Segment not found");
    });
  });
});

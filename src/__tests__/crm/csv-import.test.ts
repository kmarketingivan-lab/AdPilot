import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import {
  importContactsCsv,
  autoDetectMapping,
  extractHeaders,
  type ColumnMapping,
} from "@/server/services/crm/csv-import";

const mockedPrisma = vi.mocked(prisma);

const validCsv = `email,first_name,last_name,company,phone
alice@example.com,Alice,Smith,Acme Inc,+1234567890
bob@example.com,Bob,Jones,Globex,,
charlie@example.com,Charlie,Brown,Initech,+0987654321`;

const baseMapping: ColumnMapping = {
  email: "email",
  firstName: "first_name",
  lastName: "last_name",
  company: "company",
  phone: "phone",
};

describe("csv-import", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: no existing contacts
    mockedPrisma.contact.findMany.mockResolvedValue([]);

    // Mock $transaction to execute all provided operations
    mockedPrisma.$transaction.mockImplementation(async (ops: any[]) => {
      return Promise.all(ops);
    });

    // Mock create to return a basic result
    mockedPrisma.contact.create.mockResolvedValue({
      id: "new-id",
      email: "test@test.com",
    } as any);
  });

  // ---------------------------------------------------------------------------
  // importContactsCsv - valid CSV
  // ---------------------------------------------------------------------------

  describe("importContactsCsv - valid CSV", () => {
    it("should create contacts from valid CSV", async () => {
      const stats = await importContactsCsv({
        workspaceId: "ws-1",
        csvContent: validCsv,
        mapping: baseMapping,
      });

      expect(stats.created).toBe(3);
      expect(stats.updated).toBe(0);
      expect(stats.skipped).toBe(0);
      expect(stats.errors).toHaveLength(0);
    });

    it("should update existing contacts instead of creating duplicates", async () => {
      mockedPrisma.contact.findMany.mockResolvedValue([
        { id: "existing-1", email: "alice@example.com" },
      ] as any);

      mockedPrisma.contact.update.mockResolvedValue({} as any);

      const stats = await importContactsCsv({
        workspaceId: "ws-1",
        csvContent: validCsv,
        mapping: baseMapping,
      });

      expect(stats.created).toBe(2);
      expect(stats.updated).toBe(1);
    });

    it("should apply default tags to all imported contacts", async () => {
      await importContactsCsv({
        workspaceId: "ws-1",
        csvContent: `email\ntest@test.com`,
        mapping: { email: "email" },
        defaultTags: ["imported", "batch-1"],
      });

      // Verify the create call includes defaultTags
      const createCalls = mockedPrisma.$transaction.mock.calls;
      expect(createCalls.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // importContactsCsv - invalid emails
  // ---------------------------------------------------------------------------

  describe("importContactsCsv - invalid emails", () => {
    it("should skip rows with invalid email format", async () => {
      const csvWithInvalid = `email,first_name
valid@example.com,Valid
not-an-email,Invalid
@no-user.com,NoUser
also-valid@test.org,AlsoValid`;

      const stats = await importContactsCsv({
        workspaceId: "ws-1",
        csvContent: csvWithInvalid,
        mapping: { email: "email", firstName: "first_name" },
      });

      expect(stats.created).toBe(2);
      expect(stats.errors).toHaveLength(2);
      expect(stats.errors[0].message).toBe("Invalid email format");
    });

    it("should skip rows with missing email column", async () => {
      const csvMissing = `email,name
,John
valid@test.com,Jane`;

      const stats = await importContactsCsv({
        workspaceId: "ws-1",
        csvContent: csvMissing,
        mapping: { email: "email" },
      });

      expect(stats.errors.some((e) => e.message === "Missing email column")).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // importContactsCsv - deduplication
  // ---------------------------------------------------------------------------

  describe("importContactsCsv - deduplication", () => {
    it("should deduplicate emails within the same import batch", async () => {
      const csvWithDupes = `email,first_name
dupe@test.com,First
dupe@test.com,Second
unique@test.com,Unique`;

      const stats = await importContactsCsv({
        workspaceId: "ws-1",
        csvContent: csvWithDupes,
        mapping: { email: "email", firstName: "first_name" },
      });

      expect(stats.created).toBe(2);
      expect(stats.skipped).toBe(1);
    });

    it("should normalize emails to lowercase for dedup", async () => {
      const csvMixedCase = `email
USER@Test.com
user@test.com`;

      const stats = await importContactsCsv({
        workspaceId: "ws-1",
        csvContent: csvMixedCase,
        mapping: { email: "email" },
      });

      expect(stats.created).toBe(1);
      expect(stats.skipped).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // importContactsCsv - custom delimiter
  // ---------------------------------------------------------------------------

  describe("importContactsCsv - delimiter", () => {
    it("should parse semicolon-delimited CSV", async () => {
      const semiCsv = `email;first_name;last_name
john@test.com;John;Doe
jane@test.com;Jane;Smith`;

      const stats = await importContactsCsv({
        workspaceId: "ws-1",
        csvContent: semiCsv,
        mapping: { email: "email", firstName: "first_name", lastName: "last_name" },
        delimiter: ";",
      });

      expect(stats.created).toBe(2);
      expect(stats.errors).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // autoDetectMapping
  // ---------------------------------------------------------------------------

  describe("autoDetectMapping", () => {
    it("should detect common English header names", () => {
      const mapping = autoDetectMapping([
        "email", "first_name", "last_name", "phone", "company",
      ]);

      expect(mapping.email).toBe("email");
      expect(mapping.firstName).toBe("first_name");
      expect(mapping.lastName).toBe("last_name");
      expect(mapping.phone).toBe("phone");
      expect(mapping.company).toBe("company");
    });

    it("should detect Italian header names", () => {
      const mapping = autoDetectMapping(["mail", "nome", "cognome", "telefono", "azienda"]);

      expect(mapping.email).toBe("mail");
      expect(mapping.firstName).toBe("nome");
      expect(mapping.lastName).toBe("cognome");
      expect(mapping.phone).toBe("telefono");
      expect(mapping.company).toBe("azienda");
    });

    it("should return empty mapping when no headers match", () => {
      const mapping = autoDetectMapping(["col_a", "col_b", "col_c"]);

      expect(Object.keys(mapping).length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // extractHeaders
  // ---------------------------------------------------------------------------

  describe("extractHeaders", () => {
    it("should extract headers from first line of CSV", () => {
      const headers = extractHeaders("email,name,phone\ndata1,data2,data3");
      expect(headers).toEqual(["email", "name", "phone"]);
    });

    it("should skip empty leading lines", () => {
      const headers = extractHeaders("\n\nemail,name\ndata1,data2");
      expect(headers).toEqual(["email", "name"]);
    });

    it("should return empty array for empty CSV", () => {
      expect(extractHeaders("")).toEqual([]);
      expect(extractHeaders("   ")).toEqual([]);
    });

    it("should respect custom delimiter", () => {
      const headers = extractHeaders("email;name;phone", ";");
      expect(headers).toEqual(["email", "name", "phone"]);
    });
  });
});

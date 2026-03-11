import { Readable } from "stream";
import { prisma } from "@/lib/prisma";
import type { LeadSource, PipelineStage } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColumnMapping {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  source?: string;
  stage?: string;
  tags?: string;
}

export interface ImportOptions {
  workspaceId: string;
  csvContent: string;
  mapping: ColumnMapping;
  /** Delimiter character, defaults to comma */
  delimiter?: string;
  /** Default tags to apply to all imported contacts */
  defaultTags?: string[];
  /** Default lead source for imported contacts */
  defaultSource?: LeadSource;
}

export interface ImportStats {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; email: string; message: string }[];
}

// ---------------------------------------------------------------------------
// CSV parsing (built-in streams, no external deps)
// ---------------------------------------------------------------------------

/** Parse a single CSV line respecting quoted fields */
function parseCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

/** Stream-parse CSV content into rows of key-value pairs */
async function* parseCsvRows(
  csvContent: string,
  delimiter: string,
): AsyncGenerator<{ headers: string[]; row: Record<string, string>; lineNumber: number }> {
  const stream = Readable.from(csvContent);
  let buffer = "";
  let headers: string[] | null = null;
  let lineNumber = 0;

  for await (const chunk of stream) {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    // Keep the last (possibly incomplete) line in the buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      lineNumber++;
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (!headers) {
        headers = parseCsvLine(trimmed, delimiter);
        continue;
      }

      const values = parseCsvLine(trimmed, delimiter);
      const row: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        row[headers[i]] = values[i] ?? "";
      }

      yield { headers, row, lineNumber };
    }
  }

  // Process remaining buffer
  if (buffer.trim() && headers) {
    lineNumber++;
    const values = parseCsvLine(buffer.trim(), delimiter);
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = values[i] ?? "";
    }
    yield { headers, row, lineNumber };
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const VALID_SOURCES = new Set<string>([
  "ORGANIC", "PAID_SEARCH", "PAID_SOCIAL", "REFERRAL",
  "DIRECT", "EMAIL", "WEBINAR", "OTHER",
]);

const VALID_STAGES = new Set<string>([
  "LEAD", "MQL", "SQL", "OPPORTUNITY", "CUSTOMER", "LOST",
]);

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// ---------------------------------------------------------------------------
// Import service
// ---------------------------------------------------------------------------

/**
 * Import contacts from CSV content.
 * - Validates emails
 * - Deduplicates by email within the workspace
 * - Upserts contacts (new = create, existing = update)
 * - Returns import statistics
 */
export async function importContactsCsv(options: ImportOptions): Promise<ImportStats> {
  const {
    workspaceId,
    csvContent,
    mapping,
    delimiter = ",",
    defaultTags = [],
    defaultSource,
  } = options;

  const stats: ImportStats = { created: 0, updated: 0, skipped: 0, errors: [] };

  // Track emails seen in this import batch to deduplicate
  const seenEmails = new Set<string>();

  // Pre-fetch existing contacts for this workspace to minimize queries
  const existingContacts = await prisma.contact.findMany({
    where: { workspaceId },
    select: { id: true, email: true },
  });
  const existingEmailMap = new Map<string, string>();
  for (const c of existingContacts) {
    existingEmailMap.set(c.email.toLowerCase(), c.id);
  }

  // Collect rows for batch processing
  const creates: Parameters<typeof prisma.contact.create>[0]["data"][] = [];
  const updates: { id: string; data: Record<string, unknown> }[] = [];

  for await (const { row, lineNumber } of parseCsvRows(csvContent, delimiter)) {
    const rawEmail = row[mapping.email];
    if (!rawEmail) {
      stats.errors.push({ row: lineNumber, email: "", message: "Missing email column" });
      continue;
    }

    const email = normalizeEmail(rawEmail);

    // Validate email format
    if (!EMAIL_RE.test(email)) {
      stats.errors.push({ row: lineNumber, email, message: "Invalid email format" });
      continue;
    }

    // Deduplicate within this import batch
    if (seenEmails.has(email)) {
      stats.skipped++;
      continue;
    }
    seenEmails.add(email);

    // Build contact data from mapped columns
    const firstName = mapping.firstName ? row[mapping.firstName]?.trim() || undefined : undefined;
    const lastName = mapping.lastName ? row[mapping.lastName]?.trim() || undefined : undefined;
    const phone = mapping.phone ? row[mapping.phone]?.trim() || undefined : undefined;
    const company = mapping.company ? row[mapping.company]?.trim() || undefined : undefined;
    const jobTitle = mapping.jobTitle ? row[mapping.jobTitle]?.trim() || undefined : undefined;

    // Parse source
    let source: LeadSource | undefined = defaultSource;
    if (mapping.source && row[mapping.source]) {
      const rawSource = row[mapping.source].trim().toUpperCase();
      if (VALID_SOURCES.has(rawSource)) {
        source = rawSource as LeadSource;
      }
    }

    // Parse stage
    let stage: PipelineStage | undefined;
    if (mapping.stage && row[mapping.stage]) {
      const rawStage = row[mapping.stage].trim().toUpperCase();
      if (VALID_STAGES.has(rawStage)) {
        stage = rawStage as PipelineStage;
      }
    }

    // Parse tags (comma-separated within the field)
    let tags = [...defaultTags];
    if (mapping.tags && row[mapping.tags]) {
      const csvTags = row[mapping.tags]
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      tags = [...new Set([...tags, ...csvTags])];
    }

    const existingId = existingEmailMap.get(email);

    if (existingId) {
      // Update existing contact
      const updateData: Record<string, unknown> = {};
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (phone !== undefined) updateData.phone = phone;
      if (company !== undefined) updateData.company = company;
      if (jobTitle !== undefined) updateData.jobTitle = jobTitle;
      if (source !== undefined) updateData.source = source;
      if (stage !== undefined) updateData.stage = stage;
      if (tags.length > 0) updateData.tags = tags;

      updates.push({ id: existingId, data: updateData });
    } else {
      // Create new contact
      creates.push({
        email,
        firstName,
        lastName,
        phone,
        company,
        jobTitle,
        source,
        stage: stage ?? "LEAD",
        tags,
        workspaceId,
      });
      // Track so subsequent rows with same email don't try to create again
      existingEmailMap.set(email, "__pending__");
    }
  }

  // Execute creates in a transaction with batched operations
  if (creates.length > 0 || updates.length > 0) {
    const BATCH_SIZE = 100;

    // Process creates in batches
    for (let i = 0; i < creates.length; i += BATCH_SIZE) {
      const batch = creates.slice(i, i + BATCH_SIZE);
      try {
        await prisma.$transaction(
          batch.map((data) => prisma.contact.create({ data })),
        );
        stats.created += batch.length;
      } catch (error) {
        // Fall back to individual creates if batch fails
        for (const data of batch) {
          try {
            await prisma.contact.create({ data });
            stats.created++;
          } catch (innerErr) {
            stats.errors.push({
              row: 0,
              email: data.email,
              message: innerErr instanceof Error ? innerErr.message : "Create failed",
            });
          }
        }
      }
    }

    // Process updates in batches
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      try {
        await prisma.$transaction(
          batch.map(({ id, data }) =>
            prisma.contact.update({ where: { id }, data }),
          ),
        );
        stats.updated += batch.length;
      } catch (error) {
        // Fall back to individual updates
        for (const { id, data } of batch) {
          try {
            await prisma.contact.update({ where: { id }, data });
            stats.updated++;
          } catch (innerErr) {
            stats.errors.push({
              row: 0,
              email: id,
              message: innerErr instanceof Error ? innerErr.message : "Update failed",
            });
          }
        }
      }
    }
  }

  return stats;
}

/**
 * Auto-detect column mappings by analyzing CSV headers.
 * Returns a suggested mapping based on common header names.
 */
export function autoDetectMapping(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {};
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  const patterns: { field: keyof ColumnMapping; matches: string[] }[] = [
    { field: "email", matches: ["email", "e-mail", "email_address", "emailaddress", "mail"] },
    { field: "firstName", matches: ["first_name", "firstname", "first name", "nome", "name"] },
    { field: "lastName", matches: ["last_name", "lastname", "last name", "cognome", "surname"] },
    { field: "phone", matches: ["phone", "telephone", "tel", "mobile", "telefono", "phone_number"] },
    { field: "company", matches: ["company", "organization", "org", "azienda", "company_name"] },
    { field: "jobTitle", matches: ["job_title", "jobtitle", "title", "position", "job title", "ruolo"] },
    { field: "source", matches: ["source", "lead_source", "leadsource", "origine"] },
    { field: "stage", matches: ["stage", "pipeline_stage", "status", "stato"] },
    { field: "tags", matches: ["tags", "labels", "tag", "etichette"] },
  ];

  for (const { field, matches } of patterns) {
    const idx = lowerHeaders.findIndex((h) => matches.includes(h));
    if (idx !== -1) {
      mapping[field] = headers[idx];
    }
  }

  return mapping;
}

/**
 * Extract headers from CSV content without parsing the entire file.
 */
export function extractHeaders(csvContent: string, delimiter = ","): string[] {
  const firstLine = csvContent.split(/\r?\n/).find((line) => line.trim() !== "");
  if (!firstLine) return [];
  return parseCsvLine(firstLine.trim(), delimiter);
}

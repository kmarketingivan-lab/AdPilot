import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey, type ApiContext } from "../middleware";
import { checkRateLimit, RateLimits } from "@/lib/security";

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(0).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().optional(),
});

const createContactSchema = z.object({
  email: z.string().email("Invalid email address"),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
  company: z.string().nullish(),
  phone: z.string().nullish(),
  source: z
    .enum(["ORGANIC", "PAID_SEARCH", "PAID_SOCIAL", "REFERRAL", "DIRECT", "EMAIL", "WEBINAR", "OTHER"])
    .nullish(),
  tags: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Rate-limit helper
// ---------------------------------------------------------------------------

async function applyRateLimit(request: NextRequest): Promise<NextResponse | null> {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const identifier = `${request.method}:${request.nextUrl.pathname}:${ip}`;
  const result = await checkRateLimit(identifier, RateLimits.API);

  if (!result.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(result.resetAt - Math.ceil(Date.now() / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET /api/v1/contacts — list contacts
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  const authResult = await authenticateApiKey(request);
  if (authResult instanceof NextResponse) return authResult;
  const ctx = authResult as ApiContext;

  const { searchParams } = new URL(request.url);
  const parsed = paginationSchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined,
    search: searchParams.get("search") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { limit, offset, search } = parsed.data;

  const where: Record<string, unknown> = { workspaceId: ctx.workspaceId };
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
    ];
  }

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        company: true,
        stage: true,
        score: true,
        tags: true,
        createdAt: true,
      },
    }),
    prisma.contact.count({ where }),
  ]);

  return NextResponse.json({ data: contacts, total, limit, offset });
}

// ---------------------------------------------------------------------------
// POST /api/v1/contacts — create a contact
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  const authResult = await authenticateApiKey(request);
  if (authResult instanceof NextResponse) return authResult;
  const ctx = authResult as ApiContext;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = createContactSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { email, firstName, lastName, company, phone, source, tags } = parsed.data;

  try {
    const contact = await prisma.contact.create({
      data: {
        email,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        company: company ?? null,
        phone: phone ?? null,
        source: source ?? null,
        tags,
        workspaceId: ctx.workspaceId,
      },
    });

    return NextResponse.json({ data: contact }, { status: 201 });
  } catch (err) {
    // Unique constraint violation
    if ((err as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "A contact with this email already exists in this workspace" },
        { status: 409 },
      );
    }
    throw err;
  }
}

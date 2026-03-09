import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey, type ApiContext } from "../middleware";
import { checkRateLimit, RateLimits } from "@/lib/security";

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const PostStatusEnum = z.enum([
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED",
]);

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(0).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: PostStatusEnum.optional(),
});

const createPostSchema = z.object({
  content: z.string().min(1, "Field 'content' is required"),
  hashtags: z.array(z.string()).default([]),
  scheduledAt: z.string().datetime().nullish(),
  status: z.enum(["DRAFT", "SCHEDULED"]).default("DRAFT"),
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
// GET /api/v1/posts — list posts
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
    status: searchParams.get("status") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { limit, offset, status } = parsed.data;

  const where: Record<string, unknown> = { workspaceId: ctx.workspaceId };
  if (status) where.status = status;

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: "desc" },
      include: {
        platforms: {
          select: {
            platform: true,
            status: true,
            externalPostId: true,
          },
        },
      },
    }),
    prisma.post.count({ where }),
  ]);

  return NextResponse.json({ data: posts, total, limit, offset });
}

// ---------------------------------------------------------------------------
// POST /api/v1/posts — create a post
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

  const parsed = createPostSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { content, hashtags, scheduledAt, status } = parsed.data;

  const post = await prisma.post.create({
    data: {
      content,
      hashtags,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status,
      workspaceId: ctx.workspaceId,
    },
  });

  return NextResponse.json({ data: post }, { status: 201 });
}

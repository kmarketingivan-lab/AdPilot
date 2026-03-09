import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

export interface ApiContext {
  workspaceId: string;
  apiKeyId: string;
}

/**
 * Authenticate an API request using Bearer token.
 * Returns the workspace context or an error response.
 */
export async function authenticateApiKey(
  request: NextRequest
): Promise<ApiContext | NextResponse> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header. Use: Bearer ap_..." },
      { status: 401 }
    );
  }

  const rawKey = authHeader.slice(7);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
  });

  if (!apiKey) {
    return NextResponse.json(
      { error: "Invalid API key" },
      { status: 401 }
    );
  }

  // Check expiry
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "API key has expired" },
      { status: 401 }
    );
  }

  // Update lastUsedAt (fire-and-forget)
  prisma.apiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {});

  return {
    workspaceId: apiKey.workspaceId,
    apiKeyId: apiKey.id,
  };
}

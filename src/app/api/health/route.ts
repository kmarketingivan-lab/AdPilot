import { NextResponse } from "next/server";
import { getHealthStatus } from "@/server/services/monitoring";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getHealthStatus();

  const statusCode = health.status === "healthy" ? 200 : 503;

  return NextResponse.json(health, { status: statusCode });
}

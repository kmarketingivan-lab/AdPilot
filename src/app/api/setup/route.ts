import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

const ENV_PATH = resolve(process.cwd(), ".env");

// All credential groups with metadata
const ENV_SCHEMA = {
  infrastructure: {
    DATABASE_URL: { default: "postgresql://adpilot:adpilot_dev@localhost:5432/adpilot" },
    REDIS_URL: { default: "redis://localhost:6379" },
    NEXT_PUBLIC_APP_URL: { default: "http://localhost:3000" },
  },
  auth: {
    NEXTAUTH_SECRET: { default: "" },
    NEXTAUTH_URL: { default: "http://localhost:3000" },
    GOOGLE_CLIENT_ID: { default: "" },
    GOOGLE_CLIENT_SECRET: { default: "" },
  },
  encryption: {
    ENCRYPTION_KEY: { default: "" },
  },
  meta: {
    META_APP_ID: { default: "" },
    META_APP_SECRET: { default: "" },
  },
  linkedin: {
    LINKEDIN_CLIENT_ID: { default: "" },
    LINKEDIN_CLIENT_SECRET: { default: "" },
  },
  twitter: {
    TWITTER_CLIENT_ID: { default: "" },
    TWITTER_CLIENT_SECRET: { default: "" },
  },
  tiktok: {
    TIKTOK_CLIENT_KEY: { default: "" },
    TIKTOK_CLIENT_SECRET: { default: "" },
  },
  google_analytics: {
    GA4_PROPERTY_ID: { default: "" },
  },
  google_ads: {
    GOOGLE_ADS_DEVELOPER_TOKEN: { default: "" },
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: { default: "" },
  },
  cloudinary: {
    CLOUDINARY_CLOUD_NAME: { default: "" },
    CLOUDINARY_API_KEY: { default: "" },
    CLOUDINARY_API_SECRET: { default: "" },
  },
  ses: {
    SES_ACCESS_KEY_ID: { default: "" },
    SES_SECRET_ACCESS_KEY: { default: "" },
    SES_REGION: { default: "eu-west-1" },
    SES_FROM_EMAIL: { default: "noreply@yourdomain.com" },
  },
  stripe: {
    STRIPE_SECRET_KEY: { default: "" },
    STRIPE_WEBHOOK_SECRET: { default: "" },
    STRIPE_STARTER_PRICE_ID: { default: "" },
    STRIPE_PRO_PRICE_ID: { default: "" },
    STRIPE_AGENCY_PRICE_ID: { default: "" },
  },
  ai: {
    ANTHROPIC_API_KEY: { default: "" },
  },
  webby: {
    WEBBY_API_URL: { default: "http://localhost:8000" },
    WEBBY_API_KEY: { default: "" },
  },
} as const;

function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function buildEnvFile(values: Record<string, string>): string {
  const lines: string[] = [
    "# === AdPilot Environment Configuration ===",
    `# Generated on ${new Date().toISOString()}`,
    "",
  ];

  const sectionNames: Record<string, string> = {
    infrastructure: "Infrastructure",
    auth: "Authentication (NextAuth + Google OAuth)",
    encryption: "Encryption",
    meta: "Meta (Facebook + Instagram)",
    linkedin: "LinkedIn",
    twitter: "Twitter / X",
    tiktok: "TikTok",
    google_analytics: "Google Analytics 4",
    google_ads: "Google Ads",
    cloudinary: "Cloudinary (Media Storage)",
    ses: "Amazon SES (Email)",
    stripe: "Stripe (Billing)",
    ai: "AI (Claude API)",
    webby: "Webby Integration",
  };

  for (const [section, keys] of Object.entries(ENV_SCHEMA)) {
    lines.push(`# ${sectionNames[section] ?? section}`);
    for (const key of Object.keys(keys)) {
      const value = values[key] ?? "";
      lines.push(`${key}=${value}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// GET: read current .env values
export async function GET() {
  try {
    const content = await readFile(ENV_PATH, "utf-8").catch(() => "");
    const current = parseEnvFile(content);

    // Build response with current values (mask secrets)
    const result: Record<string, Record<string, { value: string; hasValue: boolean }>> = {};

    for (const [section, keys] of Object.entries(ENV_SCHEMA)) {
      result[section] = {};
      for (const [key, meta] of Object.entries(keys)) {
        const val = current[key] ?? meta.default;
        const isSecret =
          key.includes("SECRET") ||
          key.includes("PASSWORD") ||
          key.includes("KEY") && !key.includes("PUBLIC");
        result[section][key] = {
          value: isSecret && val ? val.slice(0, 4) + "..." + val.slice(-4) : val,
          hasValue: !!val && val !== meta.default,
        };
      }
    }

    return NextResponse.json({ values: result, envExists: content.length > 0 });
  } catch {
    return NextResponse.json({ values: {}, envExists: false });
  }
}

// POST: save .env values
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const values: Record<string, string> = body.values ?? {};

    // Read existing to preserve values not in the form
    const existing = parseEnvFile(await readFile(ENV_PATH, "utf-8").catch(() => ""));

    // Merge: new values override existing
    const merged = { ...existing };
    for (const [key, val] of Object.entries(values)) {
      // Skip masked values (they come back as "xxxx...yyyy")
      if (val.includes("...") && val.length < 12) continue;
      merged[key] = val;
    }

    // Auto-generate secrets if empty
    if (!merged.NEXTAUTH_SECRET) {
      merged.NEXTAUTH_SECRET = randomBytes(32).toString("hex");
    }
    if (!merged.ENCRYPTION_KEY) {
      merged.ENCRYPTION_KEY = randomBytes(32).toString("hex");
    }

    const content = buildEnvFile(merged);
    await writeFile(ENV_PATH, content, "utf-8");

    return NextResponse.json({ ok: true, message: "File .env salvato con successo" });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: `Errore: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }
}

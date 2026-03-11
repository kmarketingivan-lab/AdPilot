/**
 * Webby Integration Service
 *
 * Calls the local Webby API to generate and deploy landing pages
 * from Italian-language prompts.
 */

const WEBBY_API_URL = process.env.WEBBY_API_URL ?? "http://localhost:8000";

interface WebbyGenerateResponse {
  id: string;
  url: string;
  previewUrl: string;
  status: "draft" | "ready";
}

interface WebbyDeployResponse {
  id: string;
  url: string;
  status: "deployed";
}

interface WebbyErrorResponse {
  error: string;
  detail?: string;
}

class WebbyServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public detail?: string,
  ) {
    super(message);
    this.name = "WebbyServiceError";
  }
}

async function webbyFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${WEBBY_API_URL}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(process.env.WEBBY_API_KEY
        ? { Authorization: `Bearer ${process.env.WEBBY_API_KEY}` }
        : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as WebbyErrorResponse;
    throw new WebbyServiceError(
      body.error ?? `Webby API error: ${res.status}`,
      res.status,
      body.detail,
    );
  }

  return res.json() as Promise<T>;
}

/**
 * Generate a landing page from an Italian-language prompt.
 * Webby processes the prompt and returns a draft page with preview URL.
 */
export async function generateLandingPage(
  prompt: string,
  workspaceId: string,
): Promise<WebbyGenerateResponse> {
  return webbyFetch<WebbyGenerateResponse>("/api/generate", {
    method: "POST",
    body: JSON.stringify({
      prompt,
      workspaceId,
      source: "adpilot",
    }),
  });
}

/**
 * Deploy a generated landing page and auto-inject the AdPilot tracking script.
 */
export async function deployLandingPage(
  pageId: string,
): Promise<WebbyDeployResponse> {
  const trackingScript = buildTrackingScript();

  return webbyFetch<WebbyDeployResponse>(`/api/pages/${pageId}/deploy`, {
    method: "POST",
    body: JSON.stringify({
      injectScripts: [trackingScript],
    }),
  });
}

/**
 * Check if the Webby service is reachable.
 */
export async function checkWebbyHealth(): Promise<boolean> {
  try {
    await webbyFetch<{ status: string }>("/api/health");
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTrackingScript(): string {
  const trackingUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `<script defer src="${trackingUrl}/api/tracking/pixel.js"></script>`;
}

export { WebbyServiceError };

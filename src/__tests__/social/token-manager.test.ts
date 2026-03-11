import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    socialAccount: {
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

// Mock encryption
vi.mock("@/lib/encryption", () => ({
  encrypt: vi.fn((v: string) => `encrypted_${v}`),
  decrypt: vi.fn((v: string) => v.replace("encrypted_", "")),
}));

// Mock global fetch for the platform refresh calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { checkTokenExpiry, getDecryptedToken, encryptAndSave, refreshToken, refreshAllExpiring } =
  await import("@/server/services/social/token-manager");

const { prisma } = await import("@/lib/prisma");
const { decrypt } = await import("@/lib/encryption");

// ── Helpers ─────────────────────────────────────────────────────────

function makeSocialAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "acc_1",
    platform: "FACEBOOK" as const,
    accessToken: "encrypted_tok_abc",
    refreshToken: "encrypted_ref_123",
    tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    accountId: "fb_page_1",
    accountName: "Test Page",
    userId: "user_1",
    workspaceId: "ws_1",
    createdAt: new Date(),
    updatedAt: new Date(),
    avatarUrl: null,
    ...overrides,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── checkTokenExpiry ────────────────────────────────────────────────

describe("checkTokenExpiry", () => {
  it("returns not expired and no refresh needed for a token expiring in 48h", () => {
    const account = makeSocialAccount({
      tokenExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });

    const result = checkTokenExpiry(account);

    expect(result.isExpired).toBe(false);
    expect(result.needsRefresh).toBe(false);
    expect(result.expiresIn).toBeGreaterThan(0);
  });

  it("returns needsRefresh=true when token expires within 24h", () => {
    const account = makeSocialAccount({
      tokenExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12h from now
    });

    const result = checkTokenExpiry(account);

    expect(result.isExpired).toBe(false);
    expect(result.needsRefresh).toBe(true);
  });

  it("returns isExpired=true for past expiry date", () => {
    const account = makeSocialAccount({
      tokenExpiresAt: new Date(Date.now() - 1000),
    });

    const result = checkTokenExpiry(account);

    expect(result.isExpired).toBe(true);
    expect(result.needsRefresh).toBe(true);
    expect(result.expiresIn).toBe(0);
  });

  it("returns null expiresIn when tokenExpiresAt is not set", () => {
    const account = makeSocialAccount({ tokenExpiresAt: null });

    const result = checkTokenExpiry(account);

    expect(result.isExpired).toBe(false);
    expect(result.needsRefresh).toBe(false);
    expect(result.expiresIn).toBeNull();
  });
});

// ── getDecryptedToken ───────────────────────────────────────────────

describe("getDecryptedToken", () => {
  it("decrypts the access token", () => {
    const account = makeSocialAccount({ accessToken: "encrypted_my_secret" });

    const result = getDecryptedToken(account);

    expect(decrypt).toHaveBeenCalledWith("encrypted_my_secret");
    expect(result).toBe("my_secret");
  });
});

// ── encryptAndSave ──────────────────────────────────────────────────

describe("encryptAndSave", () => {
  it("encrypts the access token and updates the database", async () => {
    await encryptAndSave("acc_1", "new_tok", "new_ref", new Date("2025-06-01"));

    expect(prisma.socialAccount.update).toHaveBeenCalledWith({
      where: { id: "acc_1" },
      data: expect.objectContaining({
        accessToken: "encrypted_new_tok",
        refreshToken: "encrypted_new_ref",
        tokenExpiresAt: new Date("2025-06-01"),
      }),
    });
  });

  it("skips refreshToken when not provided", async () => {
    await encryptAndSave("acc_1", "new_tok");

    const call = (prisma.socialAccount.update as any).mock.calls[0][0];
    expect(call.data).not.toHaveProperty("refreshToken");
  });
});

// ── refreshToken (dispatcher) ───────────────────────────────────────

describe("refreshToken", () => {
  it("refreshes a Meta (FACEBOOK/INSTAGRAM) token", async () => {
    process.env.META_APP_ID = "app_id";
    process.env.META_APP_SECRET = "app_secret";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: "fresh_meta_tok",
          token_type: "bearer",
          expires_in: 5184000,
        }),
    } as unknown as Response);

    const account = makeSocialAccount({ platform: "FACEBOOK" });
    await refreshToken(account);

    expect(prisma.socialAccount.update).toHaveBeenCalled();
    const updateData = (prisma.socialAccount.update as any).mock.calls[0][0].data;
    expect(updateData.accessToken).toBe("encrypted_fresh_meta_tok");

    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
  });

  it("throws for unsupported platform", async () => {
    const account = makeSocialAccount({ platform: "YOUTUBE" });

    await expect(refreshToken(account)).rejects.toThrow("not supported");
  });

  it("throws when env vars are missing for LinkedIn", async () => {
    delete process.env.LINKEDIN_CLIENT_ID;
    delete process.env.LINKEDIN_CLIENT_SECRET;

    const account = makeSocialAccount({ platform: "LINKEDIN" });

    await expect(refreshToken(account)).rejects.toThrow("LINKEDIN_CLIENT_ID");
  });
});

// ── refreshAllExpiring ──────────────────────────────────────────────

describe("refreshAllExpiring", () => {
  it("returns counts of refreshed and failed accounts", async () => {
    (prisma.socialAccount.findMany as any).mockResolvedValueOnce([]);

    const result = await refreshAllExpiring();

    expect(result.refreshed).toBe(0);
    expect(result.failed).toEqual([]);
  });
});

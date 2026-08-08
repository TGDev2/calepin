import type { Account } from "@auth/core/types";
import { describe, expect, it, vi } from "vitest";

import { resolveOAuthAccountLink } from "./account-linking";
import type { AuthAdapter } from "./adapter";

function googleAccount(overrides: Partial<Account> = {}): Account {
  return {
    provider: "google",
    providerAccountId: "google-subject-id",
    type: "oidc",
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_at: 1_700_000_000,
    token_type: "bearer",
    scope: "openid email profile",
    id_token: "id-token",
    ...overrides,
  };
}

function fakeAdapter(overrides: Partial<AuthAdapter> = {}): AuthAdapter {
  return {
    getUserByEmail: vi.fn().mockResolvedValue(null),
    linkAccount: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as AuthAdapter;
}

describe("resolveOAuthAccountLink (CAL-026)", () => {
  it("links the account to the existing user when both sides are verified and the email matches", async () => {
    const existingUser = { id: "user-1", email: "autrice@example.test", emailVerified: new Date() };
    const adapter = fakeAdapter({ getUserByEmail: vi.fn().mockResolvedValue(existingUser) });
    const account = googleAccount();

    await resolveOAuthAccountLink(adapter, account, {
      email: "autrice@example.test",
      emailVerified: true,
    });

    expect(adapter.getUserByEmail).toHaveBeenCalledWith("autrice@example.test");
    expect(adapter.linkAccount).toHaveBeenCalledWith({ ...account, userId: "user-1" });
  });

  it("does not link when the provider reports the incoming email as unverified", async () => {
    const adapter = fakeAdapter();

    await resolveOAuthAccountLink(adapter, googleAccount(), {
      email: "autrice@example.test",
      emailVerified: false,
    });

    expect(adapter.getUserByEmail).not.toHaveBeenCalled();
    expect(adapter.linkAccount).not.toHaveBeenCalled();
  });

  it("does not link when no existing user has that email", async () => {
    const adapter = fakeAdapter({ getUserByEmail: vi.fn().mockResolvedValue(null) });

    await resolveOAuthAccountLink(adapter, googleAccount(), {
      email: "personne@example.test",
      emailVerified: true,
    });

    expect(adapter.linkAccount).not.toHaveBeenCalled();
  });

  it("does not link when the existing user's own address was never verified", async () => {
    const existingUser = { id: "user-1", email: "autrice@example.test", emailVerified: null };
    const adapter = fakeAdapter({ getUserByEmail: vi.fn().mockResolvedValue(existingUser) });

    await resolveOAuthAccountLink(adapter, googleAccount(), {
      email: "autrice@example.test",
      emailVerified: true,
    });

    expect(adapter.linkAccount).not.toHaveBeenCalled();
  });

  it("does not link an account type Auth.js does not consider OAuth", async () => {
    const existingUser = { id: "user-1", email: "autrice@example.test", emailVerified: new Date() };
    const adapter = fakeAdapter({ getUserByEmail: vi.fn().mockResolvedValue(existingUser) });
    const account = googleAccount({ type: "email" as Account["type"] });

    await resolveOAuthAccountLink(adapter, account, {
      email: "autrice@example.test",
      emailVerified: true,
    });

    expect(adapter.getUserByEmail).not.toHaveBeenCalled();
    expect(adapter.linkAccount).not.toHaveBeenCalled();
  });

  it("does nothing when the identity carries no email at all", async () => {
    const adapter = fakeAdapter();

    await resolveOAuthAccountLink(adapter, googleAccount(), {
      email: null,
      emailVerified: true,
    });

    expect(adapter.getUserByEmail).not.toHaveBeenCalled();
    expect(adapter.linkAccount).not.toHaveBeenCalled();
  });
});

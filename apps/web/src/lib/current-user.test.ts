/**
 * CAL-024 — what a server component or a server action is handed when it asks
 * who is calling.
 *
 * `auth()` is mocked, deliberately: what is under test here is the narrowing,
 * not Auth.js. Whether a real session survives a real reload is a question for
 * a real database and a real browser, and it is asked in
 * `test/integration/auth-session.integration.test.ts` and
 * `apps/web/tests/e2e/session.spec.ts`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();

vi.mock("@/lib/auth", () => ({ auth }));

const { getCurrentUser, requireCurrentUser } = await import("./current-user");

/** What Auth.js returns for a live database session. */
function sessionFor(user: Record<string, unknown>) {
  return { user, expires: new Date(Date.now() + 60_000).toISOString() };
}

beforeEach(() => {
  auth.mockReset();
});

describe("getCurrentUser", () => {
  it("returns the account behind a live session", async () => {
    auth.mockResolvedValue(
      sessionFor({
        id: "usr_1",
        email: "lectrice@example.test",
        name: "Lectrice",
        image: "https://example.test/a.png",
      }),
    );

    await expect(getCurrentUser()).resolves.toEqual({
      id: "usr_1",
      email: "lectrice@example.test",
      name: "Lectrice",
      image: "https://example.test/a.png",
    });
  });

  it("returns null when the request carries no session", async () => {
    auth.mockResolvedValue(null);

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("normalises a nameless account to null rather than to undefined", async () => {
    // An email sign-in knows an address and nothing else, and that is the
    // common case in E02 — not an edge one. `CurrentUser.name` is `string |
    // null` so a caller has one absent value to handle instead of two.
    auth.mockResolvedValue(sessionFor({ id: "usr_1", email: "sans-nom@example.test" }));

    await expect(getCurrentUser()).resolves.toEqual({
      id: "usr_1",
      email: "sans-nom@example.test",
      name: null,
      image: null,
    });
  });

  // A session missing either field is not a weaker session, it is a broken one.
  // Answering "signed in as nobody" would hand an empty owner id to
  // `openProjectScope`, which reads it as a missing authentication check.
  it.each([
    ["no id", { email: "x@example.test" }],
    ["an empty id", { id: "", email: "x@example.test" }],
    ["an id that is not a string", { id: 7, email: "x@example.test" }],
    ["no address", { id: "usr_1" }],
    ["an empty address", { id: "usr_1", email: "" }],
  ])("refuses a session with %s", async (_case, user) => {
    auth.mockResolvedValue(sessionFor(user));

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("treats a session with no user at all as no session", async () => {
    auth.mockResolvedValue({ expires: new Date().toISOString() });

    await expect(getCurrentUser()).resolves.toBeNull();
  });
});

describe("requireCurrentUser", () => {
  it("succeeds with the account when one is signed in", async () => {
    auth.mockResolvedValue(sessionFor({ id: "usr_1", email: "lectrice@example.test" }));

    const result = await requireCurrentUser();

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.id).toBe("usr_1");
  });

  it("fails as a value, with the code that answers 401 and a French message", async () => {
    auth.mockResolvedValue(null);

    const result = await requireCurrentUser();

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("UNAUTHENTICATED");
    expect(result.error.category).toBe("forbidden");
    expect(result.error.userMessage).toBe("Vous devez vous connecter pour accéder à cette page.");
  });

  it("keeps the technical message free of anything a reader would see", () => {
    // §7: `AppError.message` is developer-authored English and is the first
    // line of the stack; the French one travels in `userMessage` alone.
    auth.mockResolvedValue(null);

    return requireCurrentUser().then((result) => {
      expect(result.ok).toBe(false);
      if (result.ok) return;

      expect(result.error.message).toBe("no live session carries this request");
      expect(result.error.message).not.toBe(result.error.userMessage);
    });
  });
});

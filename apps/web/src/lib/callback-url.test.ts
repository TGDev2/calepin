import { describe, expect, it } from "vitest";

import { sanitizeCallbackUrl } from "./callback-url";

describe("sanitizeCallbackUrl", () => {
  it("passes through a same-app relative path", () => {
    expect(sanitizeCallbackUrl("/account")).toBe("/account");
    expect(sanitizeCallbackUrl("/account?tab=security")).toBe("/account?tab=security");
  });

  it("takes the first value when Next hands back an array", () => {
    expect(sanitizeCallbackUrl(["/account", "/other"])).toBe("/account");
  });

  it.each([undefined, "", "https://evil.example", "//evil.example", "/\\evil.example"])(
    "falls back to / for %j",
    (value) => {
      expect(sanitizeCallbackUrl(value)).toBe("/");
    },
  );
});

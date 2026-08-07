import { describe, expect, it } from "vitest";

import { redactSecrets } from "./redaction";

describe("redactSecrets", () => {
  it("masks credentials embedded in a database URL", () => {
    const masked = redactSecrets(
      "connect ECONNREFUSED postgresql://calepin:s3cr3t@localhost:5434/calepin",
    );

    expect(masked).not.toContain("s3cr3t");
    expect(masked).not.toContain("calepin:s3cr3t");
    expect(masked).toContain("[redacted]@localhost:5434/calepin");
  });

  it("masks credentials in a redis URL", () => {
    expect(redactSecrets("redis://default:hunter2@localhost:6379")).not.toContain("hunter2");
  });

  it("masks an Authorization header quoted in a stack", () => {
    const masked = redactSecrets("headers: { authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc }");

    expect(masked).not.toContain("eyJhbGciOiJIUzI1NiJ9.abc");
    expect(masked).toContain("Bearer [redacted]");
  });

  it("masks a provider API key", () => {
    expect(redactSecrets("invalid x-api-key sk-ant-api03-AbCdEf123456")).toBe(
      "invalid x-api-key sk-[redacted]",
    );
  });

  it("masks a presigned-URL signature", () => {
    const masked = redactSecrets(
      "GET https://s3.local/calepin/export.docx?X-Amz-Credential=AKIA123&X-Amz-Signature=deadbeefcafe&response=1",
    );

    expect(masked).not.toContain("deadbeefcafe");
    expect(masked).not.toContain("AKIA123");
    expect(masked).toContain("export.docx");
  });

  it("leaves an ordinary string untouched", () => {
    const stack =
      "TimeoutError: at ChapterRepository.save (packages/manuscript/src/repository.ts:42:7)";

    expect(redactSecrets(stack)).toBe(stack);
  });
});

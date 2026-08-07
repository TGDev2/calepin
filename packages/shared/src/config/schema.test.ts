import { describe, expect, it } from "vitest";

import { envSchema } from "./schema";

const validEnv = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://calepin:calepin@localhost:5434/calepin",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "calepin",
  S3_ACCESS_KEY_ID: "calepin",
  S3_SECRET_ACCESS_KEY: "calepin_local",
};

const withoutNodeEnv = {
  DATABASE_URL: validEnv.DATABASE_URL,
  REDIS_URL: validEnv.REDIS_URL,
  S3_ENDPOINT: validEnv.S3_ENDPOINT,
  S3_REGION: validEnv.S3_REGION,
  S3_BUCKET: validEnv.S3_BUCKET,
  S3_ACCESS_KEY_ID: validEnv.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: validEnv.S3_SECRET_ACCESS_KEY,
};

const withoutDatabaseUrl = {
  NODE_ENV: validEnv.NODE_ENV,
  REDIS_URL: validEnv.REDIS_URL,
  S3_ENDPOINT: validEnv.S3_ENDPOINT,
  S3_REGION: validEnv.S3_REGION,
  S3_BUCKET: validEnv.S3_BUCKET,
  S3_ACCESS_KEY_ID: validEnv.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: validEnv.S3_SECRET_ACCESS_KEY,
};

describe("envSchema", () => {
  it("parses a complete, valid environment", () => {
    const result = envSchema.safeParse(validEnv);

    expect(result.success).toBe(true);
  });

  it("defaults NODE_ENV to development when absent", () => {
    const result = envSchema.safeParse(withoutNodeEnv);

    expect(result.success).toBe(true);
    expect(result.success && result.data.NODE_ENV).toBe("development");
  });

  it("fails with the missing variable's path when a required variable is absent", () => {
    const result = envSchema.safeParse(withoutDatabaseUrl);

    expect(result.success).toBe(false);
    expect(result.success || result.error.issues.some((issue) => issue.path.join(".") === "DATABASE_URL")).toBe(
      true,
    );
  });

  it("fails when a variable is malformed", () => {
    const result = envSchema.safeParse({ ...validEnv, REDIS_URL: "not-a-url" });

    expect(result.success).toBe(false);
    expect(result.success || result.error.issues.some((issue) => issue.path.join(".") === "REDIS_URL")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { envSchema } from "./schema";

const validEnv = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://calepin:calepin@localhost:5434/calepin",
  AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  EMAIL_SERVER_HOST: "localhost",
  EMAIL_SERVER_PORT: "1025",
  EMAIL_SERVER_USER: "calepin",
  EMAIL_SERVER_PASSWORD: "calepin_local",
  EMAIL_FROM: "connexion@calepin.test",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  GITHUB_CLIENT_ID: "github-client-id",
  GITHUB_CLIENT_SECRET: "github-client-secret",
  ANTHROPIC_API_KEY: "anthropic-api-key",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "calepin",
  S3_ACCESS_KEY_ID: "calepin",
  S3_SECRET_ACCESS_KEY: "calepin_local",
};

/** The valid environment minus one variable, which is what each case tests. */
function envWithout(variable: keyof typeof validEnv): Record<string, string> {
  return Object.fromEntries(Object.entries(validEnv).filter(([key]) => key !== variable));
}

describe("envSchema", () => {
  it("parses a complete, valid environment", () => {
    const result = envSchema.safeParse(validEnv);

    expect(result.success).toBe(true);
  });

  it("defaults NODE_ENV to development when absent", () => {
    const result = envSchema.safeParse(envWithout("NODE_ENV"));

    expect(result.success).toBe(true);
    expect(result.success && result.data.NODE_ENV).toBe("development");
  });

  it.each([
    "DATABASE_URL",
    "AUTH_SECRET",
    "EMAIL_SERVER_HOST",
    "EMAIL_SERVER_PORT",
    "EMAIL_SERVER_USER",
    "EMAIL_SERVER_PASSWORD",
    "EMAIL_FROM",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "ANTHROPIC_API_KEY",
  ] as const)("fails with the missing variable's path when %s is absent", (variable) => {
    const result = envSchema.safeParse(envWithout(variable));

    expect(result.success).toBe(false);
    expect(
      result.success || result.error.issues.some((issue) => issue.path.join(".") === variable),
    ).toBe(true);
  });

  it("refuses a signing key too short to be one", () => {
    // Auth.js signs and encrypts the session cookie with it (CAL-024). A key
    // short enough to be guessed is worse than a missing one, because startup
    // succeeds.
    const result = envSchema.safeParse({ ...validEnv, AUTH_SECRET: "trop-court" });

    expect(result.success).toBe(false);
    expect(
      result.success || result.error.issues.some((issue) => issue.path.join(".") === "AUTH_SECRET"),
    ).toBe(true);
  });

  it("fails when a variable is malformed", () => {
    const result = envSchema.safeParse({ ...validEnv, REDIS_URL: "not-a-url" });

    expect(result.success).toBe(false);
    expect(
      result.success || result.error.issues.some((issue) => issue.path.join(".") === "REDIS_URL"),
    ).toBe(true);
  });

  // The fallback provider is optional as a group (CAL-208): a deployment that
  // wires one endpoint only is supported, and `createModelProviderPort` drops a
  // model whose provider has no adapter rather than refusing the generation.
  // `validEnv` above therefore carries none of the three, and this states it.
  it("accepts an environment with no fallback provider at all", () => {
    const result = envSchema.safeParse(validEnv);

    expect(result.success).toBe(true);
    expect(result.success && result.data.BEDROCK_REGION).toBeUndefined();
    expect(result.success && result.data.BEDROCK_ACCESS_KEY_ID).toBeUndefined();
    expect(result.success && result.data.BEDROCK_SECRET_ACCESS_KEY).toBeUndefined();
  });

  // A *half*-configured fallback parses here on purpose. The rule that refuses
  // it is `bedrockAdapterOptions`, beside the adapter it configures — the shape
  // of the environment is one question and whether an endpoint can be built
  // from it is another, and mixing them would put a composition decision in a
  // schema that has no other cross-field rule.
  it("leaves a half-configured fallback to the composition root", () => {
    const result = envSchema.safeParse({ ...validEnv, BEDROCK_REGION: "eu-west-3" });

    expect(result.success).toBe(true);
  });
});

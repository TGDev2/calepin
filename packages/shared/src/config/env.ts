import type { ZodError } from "zod";

import { envSchema } from "./schema";

function formatError(error: ZodError): string {
  const issues = error.issues.map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  return `Invalid environment configuration:\n${issues.join("\n")}`;
}

const result = envSchema.safeParse(process.env);

if (!result.success) {
  throw new Error(formatError(result.error));
}

/**
 * The only validated read of `process.env` in the application. Every other
 * file imports this instead (CLAUDE.md §3.3, §4.2) — enforced by the
 * `no-restricted-properties` ESLint rule.
 */
export const env = result.data;

/**
 * The safety net.
 *
 * The allowlist in `./fields` is the mechanism; this is what catches a secret
 * that rides inside a value the allowlist legitimately lets through. The
 * realistic case is `errorStack`: a connection failure quotes its DSN,
 * credentials included, and an HTTP failure quotes the URL it called.
 *
 * CLAUDE.md §9 is clear that a net is not a mechanism. Nothing here excuses
 * passing an unvetted string to the logger.
 */

interface SecretPattern {
  readonly pattern: RegExp;
  readonly replacement: string;
}

const SECRET_PATTERNS: readonly SecretPattern[] = [
  // Credentials embedded in a URL: postgresql://user:password@host/db
  { pattern: /([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+(?::[^/\s@]*)?@/gi, replacement: "$1[redacted]@" },
  // Authorization headers quoted in an error: "Bearer eyJhbGci..."
  { pattern: /\b(bearer|basic)\s+[\w.~+/=-]+/gi, replacement: "$1 [redacted]" },
  // Provider API keys: sk-..., sk-ant-...
  { pattern: /\bsk-[A-Za-z0-9_-]{8,}/g, replacement: "sk-[redacted]" },
  // Secrets passed as query parameters, including S3 presigned-URL signatures.
  {
    pattern:
      /([?&](?:token|key|secret|password|signature|sig|api[_-]?key|access[_-]?key|x-amz-signature|x-amz-credential)=)[^&\s]+/gi,
    replacement: "$1[redacted]",
  },
];

export function redactSecrets(value: string): string {
  let result = value;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Pino's own `redact` paths. These cover the one route the allowlist does not
 * sit on: bindings attached to the pino instance itself. Redundant today by
 * design — a second lock on a door that is already locked.
 */
export const REDACT_PATHS: readonly string[] = [
  "password",
  "token",
  "secret",
  "apiKey",
  "accessKey",
  "authorization",
  "*.password",
  "*.token",
  "*.secret",
  "*.apiKey",
  "*.accessKey",
  "*.authorization",
];

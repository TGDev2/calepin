/**
 * Collects what a logger writes, so a test can assert on the bytes that would
 * have left the process rather than on the arguments it was given. The
 * distinction matters for CAL-009: the guarantee is about the emitted line.
 */
export interface LogCapture {
  /** Pass as `createLogger({ destination })`. */
  readonly stream: { write(chunk: string): void };
  /** Every line emitted so far, parsed. */
  lines(): Record<string, unknown>[];
  /** Everything emitted so far, unparsed — the bytes themselves. */
  raw(): string;
  clear(): void;
}

export function createLogCapture(): LogCapture {
  let buffer = "";

  return {
    stream: {
      write(chunk: string): void {
        buffer += chunk;
      },
    },
    lines(): Record<string, unknown>[] {
      return buffer
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
    raw(): string {
      return buffer;
    },
    clear(): void {
      buffer = "";
    },
  };
}

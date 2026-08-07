export interface Factory<T> {
  build(overrides?: Partial<T>): T;
}

/**
 * A sequence-based data-factory builder for tests. Each `build()` call gets a
 * fresh, incrementing sequence number so factory-produced fixtures don't
 * collide on unique fields, and `overrides` wins over the generated defaults.
 */
export function createFactory<T>(build: (sequence: number) => T): Factory<T> {
  let sequence = 0;

  return {
    build(overrides: Partial<T> = {}): T {
      sequence += 1;
      return { ...build(sequence), ...overrides };
    },
  };
}

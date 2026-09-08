import { randomUUID } from 'node:crypto';

/** Identifier factory, injected so tests can produce stable IDs. */
export interface IdGenerator {
  next(): string;
}

export const uuidIdGenerator: IdGenerator = {
  next: () => randomUUID(),
};

/** Produces `${prefix}-1`, `${prefix}-2`, ... for predictable assertions. */
export function sequentialIdGenerator(prefix = 'id'): IdGenerator {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      return `${prefix}-${counter}`;
    },
  };
}

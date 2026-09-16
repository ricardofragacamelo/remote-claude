import { describe, expect, it } from 'vitest';

import { SessionId } from '@domain/session';
import { UlidGenerator } from '@shared/ids/ulid-generator';

describe('UlidGenerator', () => {
  it('produces something the domain accepts as an identifier', () => {
    expect(() => SessionId.create(new UlidGenerator().next())).not.toThrow();
  });

  it('never repeats itself', () => {
    const generator = new UlidGenerator();
    const issued = new Set(Array.from({ length: 500 }, () => generator.next()));

    expect(issued.size).toBe(500);
  });

  it('sorts by creation time, which is what makes it readable in a log', async () => {
    const generator = new UlidGenerator();

    const earlier = generator.next();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const later = generator.next();

    // Within one millisecond the suffix is random by design; the ordering the format promises is
    // the one carried by the timestamp, which is the first ten characters.
    expect(later.slice(0, 10) > earlier.slice(0, 10)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import { ClaudeSessionId } from '@domain/transcript';
import { UuidGenerator } from '@shared/ids/uuid-generator';

describe('UuidGenerator', () => {
  it('mints an id the SDK accepts as a conversation id — canonical, lowercase', () => {
    const id = new UuidGenerator().next();

    expect(ClaudeSessionId.parse(id)?.value).toBe(id);
  });

  it('never mints the same id twice in a row', () => {
    const generator = new UuidGenerator();

    expect(generator.next()).not.toBe(generator.next());
  });
});

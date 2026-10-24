import { describe, expect, it } from 'vitest';

import { memoryFileWithinFolder } from '@/engines/claude/settings/lib/project-status-words';

describe('memoryFileWithinFolder — S-150', () => {
  it('is true for origins this folder itself reaches', () => {
    expect(memoryFileWithinFolder('root')).toBe(true);
    expect(memoryFileWithinFolder('claudeDir')).toBe(true);
    expect(memoryFileWithinFolder('local')).toBe(true);
  });

  it('is false for an ancestor or the user’s own — never a link to the editor', () => {
    expect(memoryFileWithinFolder('ancestor')).toBe(false);
    expect(memoryFileWithinFolder('user')).toBe(false);
  });
});

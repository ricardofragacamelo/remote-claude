import { describe, expect, it } from 'vitest';

import {
  createSensitiveFiles,
  sensitiveSubject,
  touchesSensitive,
} from '@/shared/lib/sensitive-files';

/** An engine's own, the way a real one would register them — the mechanism, not Claude's. */
const fixture = createSensitiveFiles([
  {
    id: 'fixture.project',
    position: 100,
    path: '.fixture/settings.json',
    subject: 'projectSettings',
  },
  {
    id: 'fixture.local',
    position: 200,
    path: '.fixture/settings.local.json',
    subject: 'localSettings',
  },
  { id: 'fixture.mcp', position: 300, path: '.mcp.json', subject: 'mcpServers' },
]);

describe('the files that change what an agent may do — plan 07, D-15; plan 28, B-39', () => {
  it('are each registered engine’s own, each with what it controls', () => {
    expect(sensitiveSubject('.fixture/settings.json', fixture)).toBe('projectSettings');
    expect(sensitiveSubject('.fixture/settings.local.json', fixture)).toBe('localSettings');
    expect(sensitiveSubject('.mcp.json', fixture)).toBe('mcpServers');
    expect(sensitiveSubject('src/.mcp.json', fixture)).toBeNull();
    expect(sensitiveSubject('toString', fixture)).toBeNull();
  });

  it('are reached by an operation on them or on a folder that holds one', () => {
    expect(touchesSensitive('.fixture')).toBe(false);
    expect(touchesSensitive('.fixture', fixture)).toBe(true);
    expect(touchesSensitive('.mcp.json', fixture)).toBe(true);
    expect(touchesSensitive('.fixture-old', fixture)).toBe(false);
  });

  it('are none of the core’s own — a registry nobody filled answers nothing', () => {
    expect(sensitiveSubject('.fixture/settings.json')).toBeNull();
  });
});

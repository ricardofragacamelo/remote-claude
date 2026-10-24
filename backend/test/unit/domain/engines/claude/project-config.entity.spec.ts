import { describe, expect, it } from 'vitest';

import {
  agentRisksOf,
  memoryDiverges,
  memoryLoadedByRule,
  permissionRuleViewsOf,
} from '@domain/engines/claude';
import type { MemoryFileOrigin } from '@domain/engines/claude';

describe('memoryLoadedByRule — plan 13, B-32, S-148', () => {
  it.each<[MemoryFileOrigin, boolean]>([
    ['root', true],
    ['claudeDir', true],
    ['ancestor', true],
    ['local', false],
    ['user', false],
  ])('%s loads = %s, per the spike (docs/discovery/01, #11 round)', (origin, expected) => {
    expect(memoryLoadedByRule(origin)).toBe(expected);
  });
});

describe('memoryDiverges — plan 13, B-32, S-148', () => {
  it('is false with no live session to confirm anything', () => {
    expect(memoryDiverges(true, null)).toBe(false);
    expect(memoryDiverges(false, null)).toBe(false);
  });

  it('is false when the confirmation matches the rule', () => {
    expect(memoryDiverges(true, true)).toBe(false);
    expect(memoryDiverges(false, false)).toBe(false);
  });

  it('is true when a live session disagrees with the rule, either way', () => {
    expect(memoryDiverges(true, false)).toBe(true);
    expect(memoryDiverges(false, true)).toBe(true);
  });
});

describe('agentRisksOf — plan 13, B-36, S-175', () => {
  it('flags nothing for a frontmatter with none of the three fields', () => {
    expect(agentRisksOf({})).toEqual([]);
  });

  it('flags permissionMode when it names a mode', () => {
    expect(agentRisksOf({ permissionMode: 'acceptEdits' })).toEqual(['permissionMode']);
  });

  it('does not flag permissionMode for a blank string', () => {
    expect(agentRisksOf({ permissionMode: '   ' })).toEqual([]);
  });

  it('does not flag permissionMode for a non-string value, from a frontmatter that got the shape wrong', () => {
    expect(agentRisksOf({ permissionMode: 42 })).toEqual([]);
  });

  it('flags mcpServers whenever it is declared at all, even an empty object', () => {
    expect(agentRisksOf({ mcpServers: {} })).toEqual(['mcpServers']);
  });

  it('does not flag mcpServers when it is null or absent', () => {
    expect(agentRisksOf({ mcpServers: null })).toEqual([]);
    expect(agentRisksOf({})).toEqual([]);
  });

  it('flags broadTools for the wildcard forms', () => {
    expect(agentRisksOf({ tools: '*' })).toEqual(['broadTools']);
    expect(agentRisksOf({ tools: 'all' })).toEqual(['broadTools']);
  });

  it('does not flag broadTools for a short, deliberate list', () => {
    expect(agentRisksOf({ tools: ['Read', 'Grep'] })).toEqual([]);
  });

  it('flags broadTools for a list past the threshold — the frontmatter did not narrow much', () => {
    expect(agentRisksOf({ tools: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })).toEqual(['broadTools']);
  });

  it('is exactly at the threshold boundary: six tools is not broad, seven is (S-175 — fron)', () => {
    expect(agentRisksOf({ tools: ['a', 'b', 'c', 'd', 'e', 'f'] })).toEqual([]);
    expect(agentRisksOf({ tools: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })).toEqual(['broadTools']);
  });

  it('stacks every risk a frontmatter declares at once, in a fixed order', () => {
    expect(
      agentRisksOf({ permissionMode: 'acceptEdits', tools: '*', mcpServers: { fs: {} } }),
    ).toEqual(['permissionMode', 'mcpServers', 'broadTools']);
  });
});

describe('permissionRuleViewsOf — plan 13, B-38, S-180', () => {
  it('is empty for a project with neither allow nor deny', () => {
    expect(permissionRuleViewsOf([], [])).toEqual([]);
  });

  it('marks every deny rule as applying here', () => {
    expect(permissionRuleViewsOf([], ['Bash(rm -rf /)'])).toEqual([
      { rule: 'Bash(rm -rf /)', kind: 'deny', appliesHere: true },
    ]);
  });

  it('marks every allow rule as not applying here — the trust mark is cleared (D-17)', () => {
    expect(permissionRuleViewsOf(['Bash(npm test)'], [])).toEqual([
      { rule: 'Bash(npm test)', kind: 'allow', appliesHere: false },
    ]);
  });

  it('lists deny before allow, both kinds together', () => {
    expect(permissionRuleViewsOf(['Bash(npm test)'], ['Bash(rm -rf /)'])).toEqual([
      { rule: 'Bash(rm -rf /)', kind: 'deny', appliesHere: true },
      { rule: 'Bash(npm test)', kind: 'allow', appliesHere: false },
    ]);
  });
});

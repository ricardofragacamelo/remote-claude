import { describe, expect, it } from 'vitest';

import { describeReach, parseRulePattern } from '@domain/permission';

const reachOf = (
  pattern: string,
  decision: 'allow' | 'deny' = 'allow',
  engine: string | null = null,
) => describeReach(parseRulePattern(pattern), decision, engine);

/**
 * The structured reach a client phrases — never reinterprets — plan 15, B-02, B-08.
 */
describe('describeReach', () => {
  it('reads the whole kind as `any`, exact as `exact`, and everything else as `prefix`', () => {
    expect(reachOf('shell')).toMatchObject({ form: 'any', content: '' });
    expect(reachOf('shell(git status)')).toMatchObject({ form: 'exact', content: 'git status' });
    expect(reachOf('shell(git status:*)')).toMatchObject({ form: 'prefix', content: 'git status' });
    expect(reachOf('file.edit(src/**)')).toMatchObject({ form: 'prefix', content: 'src/**' });
  });

  it('carries the kind and the engine it was asked to describe, canonical by default', () => {
    expect(reachOf('shell(git status)')).toMatchObject({ kind: 'shell', engine: null });
    expect(reachOf('shell(git status)', 'allow', 'claude')).toMatchObject({ engine: 'claude' });
  });

  it('excludes a composite shell line only for an allow of a shell prefix — D-07', () => {
    expect(reachOf('shell(git status:*)', 'allow')).toMatchObject({ excludesCompound: true });
    expect(reachOf('shell(git status:*)', 'deny')).toMatchObject({ excludesCompound: false });
    expect(reachOf('shell(git status)', 'allow')).toMatchObject({ excludesCompound: false });
    expect(reachOf('file.edit(src/**)', 'allow')).toMatchObject({ excludesCompound: false });
  });
});

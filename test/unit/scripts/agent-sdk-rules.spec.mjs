import { describe, expect, it } from 'vitest';

import {
  argumentsAt,
  inspectAll,
  inspectSource,
  lineAt,
} from '../../../scripts/lib/agent-sdk-rules.mjs';

/**
 * A call that breaks nothing: the project scope is declared and the audit hook is wired.
 *
 * The Agent SDK does not exist in the bootstrap, which is exactly why these rules are written
 * now — a rule that arrives after the code it protects is born already violated.
 */
const COMPLIANT = `
const answer = query({
  prompt,
  options: {
    settingSources: ['project'],
    hooks: { PreToolUse: [auditHook] },
  },
});
`;

/** @param {string} source */
function rulesBrokenBy(source) {
  return inspectSource('src/claude.ts', source).map((finding) => finding.rule);
}

describe('inspectSource', () => {
  it('accepts a call that declares the project scope and the audit hook', () => {
    expect(inspectSource('src/claude.ts', COMPLIANT)).toEqual([]);
  });

  it('refuses a query() that omits settingSources — the hole opens in silence', () => {
    const source = 'query({ prompt, options: { hooks: { PreToolUse: [audit] } } });';

    expect(rulesBrokenBy(source)).toEqual(['query-needs-project-setting-sources']);
  });

  it('refuses a settingSources that does not carry the project scope', () => {
    const source = 'query({ options: { settingSources: [], hooks: { PreToolUse: [a] } } });';

    expect(rulesBrokenBy(source)).toEqual(['query-needs-project-setting-sources']);
  });

  it('refuses a query() with no PreToolUse hook — there is no audit trail without it', () => {
    const source = "query({ options: { settingSources: ['project'] } });";

    expect(rulesBrokenBy(source)).toEqual(['query-needs-pretooluse-hook']);
  });

  it('reports both when a call breaks both', () => {
    expect(rulesBrokenBy('query({ prompt });')).toEqual([
      'query-needs-project-setting-sources',
      'query-needs-pretooluse-hook',
    ]);
  });

  it('refuses skipping permissions, whatever the value is called', () => {
    expect(rulesBrokenBy('const o = { allowDangerouslySkipPermissions: true };')).toEqual([
      'no-skip-permissions',
    ]);
    expect(rulesBrokenBy('const o = { allowDangerouslySkipPermissions: flag };')).toEqual([
      'no-skip-permissions',
    ]);
  });

  it('accepts the one value the flag may hold', () => {
    expect(rulesBrokenBy('const o = { allowDangerouslySkipPermissions: false };')).toEqual([]);
  });

  it('refuses the permission mode that answers yes to everything', () => {
    expect(rulesBrokenBy("const o = { permissionMode: 'bypassPermissions' };")).toEqual([
      'no-bypass-permission-mode',
    ]);
  });

  it('accepts a permission mode that asks', () => {
    expect(rulesBrokenBy("const o = { permissionMode: 'default' };")).toEqual([]);
  });

  it('says which line to look at', () => {
    const source = `${'\n'.repeat(4)}query({ prompt });`;

    expect(inspectSource('src/claude.ts', source)[0]).toMatchObject({
      file: 'src/claude.ts',
      line: 5,
    });
  });

  it('has nothing to say about a file that never calls the SDK', () => {
    expect(inspectSource('src/health.ts', 'export const ok = () => 1;')).toEqual([]);
  });

  it('is not fooled by a method that happens to be called query', () => {
    // A database pool has a `query` too, and it takes SQL. Matching it would bury the rule in
    // findings about the migrator — which is exactly what the first real run produced.
    expect(rulesBrokenBy("await client.query('select 1');")).toEqual([]);
    expect(rulesBrokenBy('await pool?.query(sql, params);')).toEqual([]);
    expect(rulesBrokenBy('const rows = db.query(sql);')).toEqual([]);
  });

  it('still catches the bare call, which is how the SDK is imported', () => {
    expect(rulesBrokenBy('const answer = query({ prompt });')).toHaveLength(2);
  });
});

describe('argumentsAt', () => {
  it('reads a nested call whole, rather than stopping at the first bracket', () => {
    const source = 'query({ options: { hooks: { PreToolUse: [fn()] } } });';

    expect(argumentsAt(source, source.indexOf('('))).toContain('PreToolUse');
  });

  it('reads to the end when the call was never closed', () => {
    expect(argumentsAt('query({ a', 5)).toBe('{ a');
  });
});

describe('lineAt', () => {
  it('counts from one', () => {
    expect(lineAt('a\nb\nc', 0)).toBe(1);
    expect(lineAt('a\nb\nc', 4)).toBe(3);
  });
});

describe('inspectAll', () => {
  it('reports across every file it was given', () => {
    const findings = inspectAll([
      { file: 'a.ts', source: 'query({});' },
      { file: 'b.ts', source: COMPLIANT },
    ]);

    expect(findings.every((finding) => finding.file === 'a.ts')).toBe(true);
    expect(findings).toHaveLength(2);
  });
});

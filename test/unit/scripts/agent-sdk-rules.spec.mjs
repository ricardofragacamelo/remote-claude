import { describe, expect, it } from 'vitest';

import {
  argumentsAt,
  enclosingObject,
  inspectAll,
  inspectSource,
  lineAt,
  withoutComments,
} from '../../../scripts/lib/agent-sdk-rules.mjs';

/**
 * A call that breaks nothing: the project scope, the audit hook and the permission callback.
 *
 * The three settings whose absence turns a protection off **in silence**. The Agent SDK did not
 * exist in the bootstrap, which is exactly why these rules were written then — a rule that
 * arrives after the code it protects is born already violated.
 */
const COMPLIANT = `
const answer = query({
  prompt,
  options: {
    settingSources: ['project'],
    strictMcpConfig: true,
    canUseTool: bridge.canUseTool,
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
    const source =
      'query({ prompt, options: { strictMcpConfig: true, canUseTool: gate, hooks: { PreToolUse: [audit] } } });';

    expect(rulesBrokenBy(source)).toEqual(['query-needs-project-setting-sources']);
  });

  it('refuses a settingSources that does not carry the project scope', () => {
    const source =
      'query({ options: { settingSources: [], strictMcpConfig: true, canUseTool: g, hooks: { PreToolUse: [a] } } });';

    expect(rulesBrokenBy(source)).toEqual(['query-needs-project-setting-sources']);
  });

  it('refuses a query() with no PreToolUse hook — there is no audit trail without it', () => {
    const source =
      "query({ options: { settingSources: ['project'], strictMcpConfig: true, canUseTool: gate } });";

    expect(rulesBrokenBy(source)).toEqual(['query-needs-pretooluse-hook']);
  });

  it('refuses a query() with no canUseTool — the CLI then decides, and nobody is asked', () => {
    const source =
      "query({ options: { settingSources: ['project'], strictMcpConfig: true, hooks: { PreToolUse: [a] } } });";

    expect(rulesBrokenBy(source)).toEqual(['query-needs-can-use-tool']);
  });

  it('reports all four when a call breaks all four', () => {
    expect(rulesBrokenBy('query({ prompt });')).toEqual([
      'query-needs-project-setting-sources',
      'query-needs-pretooluse-hook',
      'query-needs-strict-mcp-config',
      'query-needs-can-use-tool',
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
    expect(rulesBrokenBy('const answer = query({ prompt });')).toHaveLength(4);
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
    expect(findings).toHaveLength(4);
  });
});

describe('withoutComments', () => {
  it('blanks a line comment and keeps the line it was on', () => {
    expect(withoutComments('const a = 1; // and a note\nconst b = 2;')).toBe(
      'const a = 1;              \nconst b = 2;',
    );
  });

  it('blanks a block comment across the lines it spans', () => {
    expect(withoutComments('a;\n/* two\n   lines */\nb;')).toBe('a;\n      \n           \nb;');
  });

  it('keeps the contents of strings, which is what the rules look for', () => {
    // A pass that blanked strings would stop finding `settingSources: ['project']` and would
    // report every compliant call as a violation.
    expect(withoutComments("const a = 'project';")).toBe("const a = 'project';");
  });

  it('does not mistake a URL inside a string for a comment', () => {
    expect(withoutComments("const a = 'https://example.test'; const b = 2;")).toBe(
      "const a = 'https://example.test'; const b = 2;",
    );
  });

  it('does not mistake a quote inside a comment for the start of a string', () => {
    expect(withoutComments("// it's fine\nconst a = 'kept';")).toBe(
      "            \nconst a = 'kept';",
    );
  });

  it('keeps a template literal, and the comment markers inside it', () => {
    expect(withoutComments('const a = `a // b`;')).toBe('const a = `a // b`;');
  });

  it('survives an escaped quote inside a string', () => {
    expect(withoutComments("const a = 'it\\'s'; // note")).toBe("const a = 'it\\'s';        ");
  });

  it('blanks the strings too when it is asked to', () => {
    // The view a call is looked for in: `'call query() first'` is prose, not an invocation.
    expect(withoutComments("const a = 'query()';", true)).toBe("const a = '       ';");
  });

  it('does not let a regular expression containing a quote swallow the file', () => {
    // Without the regex heuristic the scanner would believe it was inside a string from here on,
    // and every rule after this line would stop firing — silently.
    const source = 'const q = /[\'"]/; query({ prompt });';

    expect(withoutComments(source)).toBe(source);
  });

  it('leaves a division alone', () => {
    expect(withoutComments('const a = b / c; // note')).toBe('const a = b / c;        ');
  });

  it('does not let an unterminated string run past its line', () => {
    expect(withoutComments("const a = 'oops\nquery({ prompt });")).toContain('query({ prompt });');
  });
});

describe('the rules, against prose', () => {
  it('ignores a `query()` that only a comment mentions', () => {
    // This project explains the SDK at length, and a gate that reported those explanations is a
    // gate everybody learns to scroll past.
    const source = '/** The `query()` of the SDK takes options. */\nexport const a = 1;\n';

    expect(inspectSource('src/doc.ts', source)).toEqual([]);
  });

  it('ignores a `query()` inside a string', () => {
    expect(inspectSource('src/doc.ts', "const message = 'call query() with options';")).toEqual([]);
  });

  it('still catches a real call that follows a comment mentioning one', () => {
    const source = '// query() needs its options\nquery({ prompt, options: {} });\n';

    expect(inspectSource('src/claude.ts', source).map((finding) => finding.rule)).toEqual([
      'query-needs-project-setting-sources',
      'query-needs-pretooluse-hook',
      'query-needs-strict-mcp-config',
      'query-needs-can-use-tool',
    ]);
  });

  it('reports the line of the call and not of the comment', () => {
    const source = '// a note\n// another\nquery({ prompt, options: {} });\n';

    expect(inspectSource('src/claude.ts', source)[0]?.line).toBe(3);
  });

  it('ignores `allowDangerouslySkipPermissions` written in a comment', () => {
    const source = '// allowDangerouslySkipPermissions: true would be a disaster\nconst a = 1;\n';

    expect(inspectSource('src/claude.ts', source)).toEqual([]);
  });
});

/** A file of the Claude adapter, where `settings:` is the SDK's option. */
const ADAPTER = 'backend/src/adapter/outbound/claude/sdk-options.factory.ts';

/** @param {string} source @param {string} [file] */
function extensionRulesBrokenBy(source, file = ADAPTER) {
  return inspectSource(file, source).map((finding) => finding.rule);
}

describe('the doors of plan 13 — ADR-018', () => {
  it('refuses a query() without strictMcpConfig: true — S-06', () => {
    const source =
      "query({ options: { settingSources: ['project'], strictMcpConfig: false, canUseTool: g, " +
      'hooks: { PreToolUse: [a] } } });';

    expect(rulesBrokenBy(source)).toEqual(['query-needs-strict-mcp-config']);
  });

  it('refuses updateSettings, applyFlagSettings and managedSettings anywhere — S-07', () => {
    expect(extensionRulesBrokenBy("await q.updateSettings('userSettings', {});", 'a.ts')).toEqual([
      'no-update-settings',
    ]);
    expect(extensionRulesBrokenBy('await q.applyFlagSettings({ effortLevel });', 'a.ts')).toEqual([
      'no-apply-flag-settings',
    ]);
    expect(extensionRulesBrokenBy('const o = { managedSettings: {} };', 'a.ts')).toEqual([
      'no-managed-settings',
    ]);
  });

  it('refuses the flag layer in the Claude adapter unless the builder makes it — S-07', () => {
    expect(extensionRulesBrokenBy('const o = { settings: { permissions: {} } };')).toEqual([
      'flag-settings-only-through-the-builder',
    ]);
    expect(
      extensionRulesBrokenBy('const o = { settings: flagSettings({ outputStyle }) };'),
    ).toEqual([]);
    expect(extensionRulesBrokenBy('const o = { settings: 1 };', 'backend/src/x/config.ts')).toEqual(
      [],
    );
  });

  it("refuses an MCP server's tool policy, and alwaysLoad — S-09", () => {
    expect(
      extensionRulesBrokenBy("const s = { tools: [{ permission_policy: 'always_allow' }] };"),
    ).toEqual(['no-mcp-tool-policy']);
    expect(extensionRulesBrokenBy('const s = { alwaysLoad: true };')).toEqual([
      'no-mcp-tool-policy',
    ]);
  });

  it('refuses a local plugin without skipMcpDiscovery: true — S-09', () => {
    expect(extensionRulesBrokenBy("const p = [{ type: 'local', path }];")).toEqual([
      'plugin-needs-skip-mcp-discovery',
    ]);
    expect(
      extensionRulesBrokenBy("const p = [{ type: 'local', path, skipMcpDiscovery: false }];"),
    ).toEqual(['plugin-needs-skip-mcp-discovery', 'plugin-needs-skip-mcp-discovery']);
    expect(
      extensionRulesBrokenBy(
        "const p = [{ type: 'local', nested: { a: 1 }, skipMcpDiscovery: true }];",
      ),
    ).toEqual([]);
  });

  it('refuses the control requests that have no public method — S-145', () => {
    for (const subtype of ['get_hooks_listing', 'list_permission_rules', 'get_settings']) {
      expect(extensionRulesBrokenBy(`send({ subtype: '${subtype}' });`, 'a.ts')).toEqual([
        'no-private-control-request',
      ]);
    }
  });

  it('reads none of these names out of a comment', () => {
    const source =
      '// updateSettings( and applyFlagSettings( and managedSettings: are refused\nexport {};\n';

    expect(extensionRulesBrokenBy(source)).toEqual([]);
  });
});

describe('enclosingObject', () => {
  it('reads the object literal around a position, nested objects included', () => {
    const source = "x = [{ a: { b: 1 }, type: 'local', c: 2 }];";

    expect(enclosingObject(source, source.indexOf('type'))).toBe(
      " a: { b: 1 }, type: 'local', c: 2 ",
    );
  });

  it('reads from the start when no brace opens before the position', () => {
    expect(enclosingObject("type: 'local'", 3)).toBe('typ');
  });
});

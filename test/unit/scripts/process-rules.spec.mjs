import { describe, expect, it } from 'vitest';

import { inspectAll, inspectSource } from '../../../scripts/lib/process-rules.mjs';

describe('the shell-is-forbidden rule — ADR-016', () => {
  it('finds shell: true', () => {
    const findings = inspectSource('a.ts', "spawn('rg', args, { shell: true });");

    expect(findings).toMatchObject([{ rule: 'no-shell-true', file: 'a.ts', line: 1 }]);
  });

  it('finds exec(', () => {
    const findings = inspectSource('a.ts', "exec('rg ' + pattern);");

    expect(findings).toMatchObject([{ rule: 'no-exec', file: 'a.ts', line: 1 }]);
  });

  it('finds execSync(', () => {
    const findings = inspectSource('a.ts', "const out = execSync('rg ' + pattern);");

    expect(findings).toMatchObject([{ rule: 'no-exec-sync', file: 'a.ts', line: 1 }]);
  });

  it('finds spawn() called with a single string command', () => {
    const findings = inspectSource('a.ts', "spawn('rg ' + pattern);");

    expect(findings).toMatchObject([{ rule: 'no-single-string-command', file: 'a.ts', line: 1 }]);
  });

  it('allows spawn() with an argv array and shell left at its default', () => {
    expect(inspectSource('a.ts', "spawn(RIPGREP_PATH, ['--json', pattern], { env });")).toEqual([]);
  });

  it('allows execFile() with an argv array', () => {
    expect(inspectSource('a.ts', "execFile(RIPGREP_PATH, ['--json', pattern], callback);")).toEqual(
      [],
    );
  });

  it('does not flag a member call that happens to share the name', () => {
    expect(inspectSource('a.ts', 'child.exec(callback);')).toEqual([]);
  });

  it('ignores a mention inside a comment', () => {
    expect(inspectSource('a.ts', '// never call exec() or spawn() with shell: true here')).toEqual(
      [],
    );
  });

  it('reports every occurrence, not only the first', () => {
    expect(inspectSource('a.ts', "exec('a');\nexecSync('b');")).toHaveLength(2);
  });

  it('inspects a set of files, keeping which one each finding came from', () => {
    const findings = inspectAll([
      { file: 'a.ts', source: "exec('a');" },
      { file: 'b.ts', source: 'clean();' },
      { file: 'c.ts', source: "spawn('a');" },
    ]);

    expect(findings.map((finding) => finding.file)).toEqual(['a.ts', 'c.ts']);
  });
});

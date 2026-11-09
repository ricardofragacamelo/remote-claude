import { beforeEach, describe, expect, it } from 'vitest';

import {
  RULE_EXPORT_FORMAT,
  RULE_EXPORT_VERSION,
  digestOfImportFile,
  PreviewRuleImportUseCase,
} from '@application/permission';
import { PermissionRuleImportUnsupportedError } from '@domain/permission';
import {
  aPermissionModule,
  PERMISSION_OWNER,
  TEST_PERMISSION_SETTINGS,
} from '../../../support/builders/permission.builder';

const owner = PERMISSION_OWNER;

function fileOf(rules: readonly Record<string, unknown>[]): string {
  return JSON.stringify({
    format: RULE_EXPORT_FORMAT,
    version: RULE_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    rules,
  });
}

describe('PreviewRuleImportUseCase', () => {
  let harness: ReturnType<typeof aPermissionModule>;
  let useCase: PreviewRuleImportUseCase;

  beforeEach(() => {
    harness = aPermissionModule();
    useCase = new PreviewRuleImportUseCase(harness.rules, TEST_PERMISSION_SETTINGS, harness.clock);
  });

  it('answers the digest of the file, and one verdict per item, in order — S-138', async () => {
    const file = fileOf([
      { pattern: 'shell(pnpm test:*)', decision: 'allow', scope: 'always' },
      { pattern: 'Bash(git status)', decision: 'allow', scope: 'always' },
    ]);

    const preview = await useCase.execute(owner, file);

    expect(preview.digest).toBe(digestOfImportFile(file));
    expect(preview.items).toEqual([
      {
        index: 0,
        pattern: 'shell(pnpm test:*)',
        decision: 'allow',
        scope: 'always',
        verdict: { kind: 'new', breadth: 'narrow' },
      },
      {
        index: 1,
        pattern: 'Bash(git status)',
        decision: 'allow',
        scope: 'always',
        verdict: { kind: 'invalid', code: 'PERMISSION_RULE_PATTERN_INVALID' },
      },
    ]);
  });

  it('reads an envelope problem as a thrown error, not a per-item verdict — S-140', async () => {
    await expect(useCase.execute(owner, '{not json')).rejects.toThrow(
      PermissionRuleImportUnsupportedError,
    );
  });

  it('never writes anything — a preview is read only', async () => {
    const file = fileOf([{ pattern: 'shell(ls)', decision: 'allow', scope: 'always' }]);

    await useCase.execute(owner, file);

    expect(harness.rules.rules).toHaveLength(0);
  });

  it('shows a non-string `pattern`/`decision`/`scope` as empty, never a crash', async () => {
    const file = fileOf([{ pattern: 42, decision: true, scope: null }]);

    const preview = await useCase.execute(owner, file);

    expect(preview.items[0]).toMatchObject({ pattern: '', decision: '', scope: '' });
  });
});

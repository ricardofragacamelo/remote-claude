import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RULE_EXPORT_FORMAT,
  RULE_EXPORT_VERSION,
  digestOfImportFile,
  ImportPermissionRulesUseCase,
} from '@application/permission';
import { RecordAuditEventUseCase } from '@application/audit';
import { PermissionRuleImportRejectedError } from '@domain/permission';
import { UserId } from '@domain/auth';
import { aPermissionModule, PERMISSION_OWNER } from '../../../support/builders/permission.builder';

const owner = PERMISSION_OWNER;

function fileOf(rules: readonly Record<string, unknown>[]): string {
  return JSON.stringify({
    format: RULE_EXPORT_FORMAT,
    version: RULE_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    rules,
  });
}

describe('ImportPermissionRulesUseCase', () => {
  let harness: ReturnType<typeof aPermissionModule>;
  let useCase: ImportPermissionRulesUseCase;

  beforeEach(() => {
    harness = aPermissionModule();
    useCase = new ImportPermissionRulesUseCase(
      harness.grant,
      new RecordAuditEventUseCase(harness.trail, harness.ids),
      harness.ids,
      harness.clock,
    );
  });

  it('creates every accepted item, and counts what was actually new', async () => {
    const file = fileOf([
      { pattern: 'shell(pnpm test:*)', decision: 'allow', scope: 'always', projectPath: null },
      { pattern: 'shell(curl:*)', decision: 'deny', scope: 'always', projectPath: null },
    ]);

    const result = await useCase.execute({
      userId: owner,
      file,
      digest: digestOfImportFile(file),
      accept: [0, 1],
      acknowledgeBroad: [],
      folderMap: {},
    });

    expect(result.counts).toEqual({ created: 2, existing: 0 });
    expect(result.rules.map((rule) => rule.ruleContent)).toEqual([
      'shell(pnpm test:*)',
      'shell(curl:*)',
    ]);
    expect(result.rules.every((rule) => rule.grantedVia === 'import')).toBe(true);
  });

  it("refuses a `digest` that is not the file's own — S-143", async () => {
    const file = fileOf([{ pattern: 'shell(ls)', decision: 'allow', scope: 'always' }]);

    await expect(
      useCase.execute({
        userId: owner,
        file,
        digest: 'not-the-real-digest',
        accept: [0],
        acknowledgeBroad: [],
        folderMap: {},
      }),
    ).rejects.toThrow('digest');
  });

  it('refuses an `accept`/`acknowledgeBroad` index the file does not have', async () => {
    const file = fileOf([{ pattern: 'shell(ls)', decision: 'allow', scope: 'always' }]);

    await expect(
      useCase.execute({
        userId: owner,
        file,
        digest: digestOfImportFile(file),
        accept: [5],
        acknowledgeBroad: [],
        folderMap: {},
      }),
    ).rejects.toThrow('index');
  });

  it('writes nothing when any accepted item fails revalidation — S-142', async () => {
    const file = fileOf([
      { pattern: 'shell(pnpm test:*)', decision: 'allow', scope: 'always' },
      { pattern: 'Bash(git status)', decision: 'allow', scope: 'always' },
    ]);

    await expect(
      useCase.execute({
        userId: owner,
        file,
        digest: digestOfImportFile(file),
        accept: [0, 1],
        acknowledgeBroad: [],
        folderMap: {},
      }),
    ).rejects.toThrow(PermissionRuleImportRejectedError);
    expect(harness.rules.rules).toHaveLength(0);
  });

  it('never refuses a `broad` item that acknowledged it, and always refuses `unbounded` — S-147', async () => {
    const file = fileOf([
      { pattern: 'shell(pnpm)', decision: 'allow', scope: 'always' },
      { pattern: 'shell', decision: 'allow', scope: 'always' },
    ]);

    await expect(
      useCase.execute({
        userId: owner,
        file,
        digest: digestOfImportFile(file),
        accept: [0, 1],
        acknowledgeBroad: [0],
        folderMap: {},
      }),
    ).rejects.toThrow(PermissionRuleImportRejectedError);

    const broadOnly = fileOf([{ pattern: 'shell(pnpm)', decision: 'allow', scope: 'always' }]);
    const result = await useCase.execute({
      userId: owner,
      file: broadOnly,
      digest: digestOfImportFile(broadOnly),
      accept: [0],
      acknowledgeBroad: [0],
      folderMap: {},
    });

    expect(result.counts.created).toBe(1);
  });

  it("ignores the file's own validity, and still refuses past the ceiling — S-148", async () => {
    const past = new Date(0).toISOString();
    const file = fileOf([
      { pattern: 'shell(ls)', decision: 'allow', scope: 'always', expiresAt: past },
    ]);

    const result = await useCase.execute({
      userId: owner,
      file,
      digest: digestOfImportFile(file),
      accept: [0],
      acknowledgeBroad: [],
      folderMap: {},
    });

    expect(result.rules[0]?.expiresAt.getTime()).toBeGreaterThan(harness.clock.now().getTime());

    const tenYearsMs = 10 * 365 * 24 * 60 * 60 * 1000;
    const another = fileOf([{ pattern: 'shell(a)', decision: 'allow', scope: 'always' }]);

    await expect(
      useCase.execute({
        userId: owner,
        file: another,
        digest: digestOfImportFile(another),
        accept: [0],
        acknowledgeBroad: [],
        folderMap: {},
        expiresAt: new Date(harness.clock.now().getTime() + tenYearsMs),
      }),
    ).rejects.toThrow(PermissionRuleImportRejectedError);
  });

  it('maps a `project` item through `folderMap`, validated as a creation would be — S-144', async () => {
    const file = fileOf([
      {
        pattern: 'shell(pnpm test:*)',
        decision: 'allow',
        scope: 'project',
        projectPath: '/remote/machine/app',
      },
    ]);

    const result = await useCase.execute({
      userId: owner,
      file,
      digest: digestOfImportFile(file),
      accept: [0],
      acknowledgeBroad: [],
      folderMap: { '/remote/machine/app': '/srv/projects/app' },
    });

    expect(result.rules[0]?.projectPath).toBe('/srv/projects/app');
    expect(harness.folders.calls.some((call) => call.raw === '/srv/projects/app')).toBe(true);
  });

  it('resolves the original `projectPath` when `folderMap` has no entry for it', async () => {
    const file = fileOf([
      {
        pattern: 'shell(pnpm test:*)',
        decision: 'allow',
        scope: 'project',
        projectPath: '/remote/machine/app',
      },
    ]);

    await useCase.execute({
      userId: owner,
      file,
      digest: digestOfImportFile(file),
      accept: [0],
      acknowledgeBroad: [],
      folderMap: {},
    });

    expect(harness.folders.calls.some((call) => call.raw === '/remote/machine/app')).toBe(true);
  });

  it("reports a rejection's code as INVALID_INPUT when the grant routine throws something with none", async () => {
    const file = fileOf([{ pattern: 'shell(pnpm test:*)', decision: 'allow', scope: 'always' }]);

    vi.spyOn(harness.grant, 'validate').mockRejectedValueOnce(new Error('unexpected'));

    try {
      await useCase.execute({
        userId: owner,
        file,
        digest: digestOfImportFile(file),
        accept: [0],
        acknowledgeBroad: [],
        folderMap: {},
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PermissionRuleImportRejectedError);
      const rejected = error as PermissionRuleImportRejectedError;
      expect(rejected.rejections).toEqual([{ index: 0, code: 'INVALID_INPUT' }]);
    }
  });

  it('creates nothing the second time the same file is applied — S-145', async () => {
    const file = fileOf([{ pattern: 'shell(pnpm test:*)', decision: 'allow', scope: 'always' }]);
    const command = {
      userId: owner,
      file,
      digest: digestOfImportFile(file),
      accept: [0],
      acknowledgeBroad: [],
      folderMap: {},
    };

    await useCase.execute(command);
    const second = await useCase.execute(command);

    expect(second.counts).toEqual({ created: 0, existing: 1 });
  });

  it('leaves what already landed standing when a later write fails — S-149', async () => {
    const file = fileOf([
      { pattern: 'shell(pnpm test:*)', decision: 'allow', scope: 'always' },
      { pattern: 'shell(pnpm lint:*)', decision: 'allow', scope: 'always' },
    ]);
    const failure = new Error('the database went away');
    const original = harness.rules.grant.bind(harness.rules);
    let calls = 0;

    vi.spyOn(harness.rules, 'grant').mockImplementation((rule, now) => {
      calls += 1;
      return calls === 2 ? Promise.reject(failure) : original(rule, now);
    });

    await expect(
      useCase.execute({
        userId: owner,
        file,
        digest: digestOfImportFile(file),
        accept: [0, 1],
        acknowledgeBroad: [],
        folderMap: {},
      }),
    ).rejects.toThrow(failure);

    expect(harness.rules.rules).toHaveLength(1);
    expect(harness.rules.rules[0]?.ruleContent).toBe('shell(pnpm test:*)');
  });

  it("refuses a rule for somebody else to be read as this caller's — S-139", async () => {
    const stranger = UserId.create('auth|stranger');
    const file = JSON.stringify({
      format: RULE_EXPORT_FORMAT,
      version: RULE_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      rules: [
        {
          pattern: 'shell(pnpm test:*)',
          decision: 'allow',
          scope: 'always',
          userId: stranger.value,
          id: 'r-somebody-elses',
        },
      ],
    });

    const result = await useCase.execute({
      userId: owner,
      file,
      digest: digestOfImportFile(file),
      accept: [0],
      acknowledgeBroad: [],
      folderMap: {},
    });

    expect(result.rules[0]?.userId.equals(owner)).toBe(true);
  });
});

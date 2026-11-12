import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ImportRulesDialog } from '@/features/permission/components/ImportRulesDialog';
import type { RuleImportResult } from '@/features/permission/types/rule';
import { Toaster } from '@/shared/components/ui/sonner';
import { api } from '@/shared/api/api';
import { render, translator } from '../../../support/render';
import { aListing, fakeWorkspaceApi, projects } from '../../../support/workspace-api';

const t = translator('en');

afterEach(() => {
  // Each test sets its own `vi.spyOn(api, ...)` implementation fresh — without restoring, an
  // already-spied method's own `.mock.calls` keeps every earlier test's calls too.
  vi.restoreAllMocks();
});

interface FileRule {
  readonly pattern: string;
  readonly decision: string;
  readonly scope: string;
  readonly projectPath: string | null;
}

const RULES: readonly FileRule[] = [
  { pattern: 'shell(pnpm test:*)', decision: 'allow', scope: 'always', projectPath: null },
  { pattern: 'shell(npm test:*)', decision: 'allow', scope: 'always', projectPath: null },
];

/** The file's own bytes, as the real export format writes them (D-16/D-17) — `importedPathsOf`
 * reads `rules[].projectPath` straight out of this, same text the preview itself was sent. */
function fileOf(rules: readonly FileRule[] = RULES): string {
  return JSON.stringify({
    format: 'remote-claude.permission-rules',
    version: 1,
    exportedAt: '2000-01-01T00:00:00.000Z',
    rules,
  });
}

function previewItemsFor(
  rules: readonly FileRule[],
  overrides: Partial<Record<number, Partial<Record<string, unknown>>>> = {},
): readonly Record<string, unknown>[] {
  return rules.map((rule, index) => ({
    index,
    pattern: rule.pattern,
    decision: rule.decision,
    scope: rule.scope,
    verdict: 'new',
    breadth: 'narrow',
    ...overrides[index],
  }));
}

/** `api.post`, answering the preview and apply routes — by path, as every sibling spec in this
 * feature does. The caller sets up `api.get` separately via `fakeWorkspaceApi`, for `useRoots`. */
function mockImportApi(options: {
  previewItems?: readonly Record<string, unknown>[];
  previewError?: unknown;
  applyResult?: RuleImportResult;
  applyError?: unknown;
}): { post: ReturnType<typeof vi.spyOn> } {
  const post = vi.spyOn(api, 'post').mockImplementation((path: unknown, body?: unknown) => {
    const p = String(path);

    if (p === '/permission-rules/import/preview') {
      if (options.previewError !== undefined) {
        return Promise.reject(options.previewError);
      }
      return Promise.resolve({
        digest: 'sha-fixed',
        items: options.previewItems ?? previewItemsFor(RULES),
      });
    }

    if (p === '/permission-rules/import') {
      if (options.applyError !== undefined) {
        return Promise.reject(options.applyError);
      }
      return Promise.resolve(
        options.applyResult ?? { counts: { created: 2, existing: 0 }, rules: [] },
      );
    }

    return Promise.reject(new Error(`unexpected POST ${p} ${JSON.stringify(body)}`));
  });

  return { post };
}

function renderDialog(onApplied = vi.fn()): {
  onOpenChange: ReturnType<typeof vi.fn>;
  onApplied: ReturnType<typeof vi.fn>;
} {
  const onOpenChange = vi.fn();
  render(
    <>
      <Toaster containerAriaLabel="toasts" />
      <ImportRulesDialog open onOpenChange={onOpenChange} onApplied={onApplied} />
    </>,
  );
  return { onOpenChange, onApplied };
}

async function chooseFile(content = fileOf()): Promise<void> {
  const input = screen.getByLabelText(t('rules.import.chooseFile'));
  const file = new File([content], 'rules.json', { type: 'application/json' });
  await userEvent.upload(input, file);
}

async function pickFirstValidityShortcut(): Promise<void> {
  await userEvent.click(
    await screen.findByRole('button', { name: t('permission.ruleExpiry.shortcut7') }),
  );
}

describe('ImportRulesDialog — "Importar" (plan 15, B-31, D-17)', () => {
  it('reads nothing while closed', () => {
    const get = vi.spyOn(api, 'get');
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <ImportRulesDialog open={false} onOpenChange={onOpenChange} onApplied={vi.fn()} />,
    );

    expect(get).not.toHaveBeenCalled();

    rerender(<ImportRulesDialog open onOpenChange={onOpenChange} onApplied={vi.fn()} />);

    expect(screen.getByText(t('rules.import.chooseFile'))).toBeInTheDocument();
  });

  it('shows the file chooser first, never reading anything before a file is chosen', () => {
    fakeWorkspaceApi({ roots: [projects] });
    const { post } = mockImportApi({});
    renderDialog();

    expect(screen.getByText(t('rules.import.chooseFile'))).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('sends the chosen file’s own text for preview, once chosen', async () => {
    fakeWorkspaceApi({ roots: [projects] });
    const { post } = mockImportApi({});
    renderDialog();

    const content = fileOf();
    await chooseFile(content);

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/permission-rules/import/preview', { file: content });
    });
  });

  it('shows every item’s pattern, and an `existing` verdict for an already-granted one', async () => {
    fakeWorkspaceApi({ roots: [projects] });
    mockImportApi({ previewItems: previewItemsFor(RULES, { 1: { verdict: 'existing' } }) });
    renderDialog();
    await chooseFile();

    expect(await screen.findByText('shell(pnpm test:*)')).toBeInTheDocument();
    expect(screen.getByText('shell(npm test:*)')).toBeInTheDocument();
    expect(screen.getByText(t('rules.import.verdictExisting'))).toBeInTheDocument();
  });

  it('shows a `deny` decision chip for a deny rule', async () => {
    fakeWorkspaceApi({ roots: [projects] });
    const rules = [{ ...RULES[0]!, decision: 'deny' }];
    mockImportApi({ previewItems: previewItemsFor(rules) });
    renderDialog();
    await chooseFile(fileOf(rules));

    expect(await screen.findByText(t('rules.decision.deny'))).toBeInTheDocument();
  });

  it('ignores a cancelled file dialog, staying on the chooser', async () => {
    fakeWorkspaceApi({ roots: [projects] });
    const { post } = mockImportApi({});
    renderDialog();

    const input = screen.getByLabelText(t('rules.import.chooseFile'));
    await userEvent.upload(input, []);

    expect(screen.getByText(t('rules.import.chooseFile'))).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('re-checking a row toggled off puts it back in `accept`', async () => {
    fakeWorkspaceApi({ roots: [projects] });
    const { post } = mockImportApi({});
    renderDialog();
    await chooseFile();
    await pickFirstValidityShortcut();

    const checkboxes = await screen.findAllByRole('checkbox');
    await userEvent.click(checkboxes[0]!);
    expect(checkboxes[0]).not.toBeChecked();
    await userEvent.click(checkboxes[0]!);
    expect(checkboxes[0]).toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: t('rules.import.confirm') }));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/permission-rules/import', expect.anything());
    });
    const [, body] = post.mock.calls.find(
      ([path]: [unknown]) => path === '/permission-rules/import',
    )!;
    expect((body as { accept: readonly number[] }).accept).toEqual([0, 1]);
  });

  it('forces an `invalid` item unchecked, disabled, and shows the reason', async () => {
    fakeWorkspaceApi({ roots: [projects] });
    mockImportApi({
      previewItems: previewItemsFor(RULES, {
        0: { verdict: 'invalid', breadth: undefined, code: 'INVALID_INPUT' },
      }),
    });
    renderDialog();
    await chooseFile();

    const invalidLabel = await screen.findByText(t('rules.import.verdictInvalid'));
    const row = invalidLabel.closest('tr')!;
    const checkbox = within(row).getByRole('checkbox');
    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();
  });

  it('forces an unbounded `allow` item unchecked, disabled — D-09', async () => {
    fakeWorkspaceApi({ roots: [projects] });
    mockImportApi({
      previewItems: previewItemsFor(RULES, { 0: { decision: 'allow', breadth: 'unbounded' } }),
    });
    renderDialog();
    await chooseFile();

    const blockedLabel = await screen.findByText(t('rules.import.unboundedBlocked'));
    const row = blockedLabel.closest('tr')!;
    const checkbox = within(row).getByRole('checkbox');
    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();
  });

  it('needs its own acknowledgement for each accepted `broad` item, independently — S-206', async () => {
    fakeWorkspaceApi({ roots: [projects] });
    mockImportApi({
      previewItems: previewItemsFor(RULES, { 0: { breadth: 'broad' }, 1: { breadth: 'broad' } }),
    });
    renderDialog();
    await chooseFile();
    await pickFirstValidityShortcut();

    const acknowledges = await screen.findAllByText(t('rules.import.acknowledgeBroad'));
    expect(acknowledges).toHaveLength(2);
    expect(screen.getByRole('button', { name: t('rules.import.confirm') })).toBeDisabled();

    const ackCheckbox = (label: HTMLElement) =>
      within(label.closest('tr')!).getByRole('checkbox', {
        name: t('rules.import.acknowledgeBroad'),
      });
    await userEvent.click(ackCheckbox(acknowledges[0]!));

    // Still disabled — the second broad item's own acknowledgement is still outstanding.
    expect(screen.getByRole('button', { name: t('rules.import.confirm') })).toBeDisabled();

    await userEvent.click(ackCheckbox(acknowledges[1]!));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: t('rules.import.confirm') })).toBeEnabled();
    });
  });

  it('un-acknowledging a `broad` item disables Confirm again', async () => {
    fakeWorkspaceApi({ roots: [projects] });
    mockImportApi({ previewItems: previewItemsFor(RULES, { 0: { breadth: 'broad' } }) });
    renderDialog();
    await chooseFile();
    await pickFirstValidityShortcut();

    const label = await screen.findByText(t('rules.import.acknowledgeBroad'));
    const ackCheckbox = within(label.closest('tr')!).getByRole('checkbox', {
      name: t('rules.import.acknowledgeBroad'),
    });
    await userEvent.click(ackCheckbox);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: t('rules.import.confirm') })).toBeEnabled();
    });

    await userEvent.click(ackCheckbox);

    expect(screen.getByRole('button', { name: t('rules.import.confirm') })).toBeDisabled();
  });

  it('shows a remap button for a `project` item whose folder this installation does not have', async () => {
    fakeWorkspaceApi({ roots: [projects] });
    const rules = [{ ...RULES[0]!, scope: 'project', projectPath: '/elsewhere' }];
    mockImportApi({ previewItems: previewItemsFor(rules) });
    renderDialog();
    await chooseFile(fileOf(rules));

    expect(
      await screen.findByRole('button', {
        name: t('rules.import.remap', { folder: '/elsewhere' }),
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('rules.import.confirm') })).toBeDisabled();
  });

  it('remaps the folder through the shared seletor, which then lets Confirm enable', async () => {
    fakeWorkspaceApi({
      roots: [projects],
      directories: (asked) => aListing(projects, asked.get('path') ?? projects.path, []),
    });
    const rules = [{ ...RULES[0]!, scope: 'project', projectPath: '/elsewhere' }];
    mockImportApi({ previewItems: previewItemsFor(rules) });
    renderDialog();
    await chooseFile(fileOf(rules));
    await pickFirstValidityShortcut();

    await userEvent.click(
      await screen.findByRole('button', {
        name: t('rules.import.remap', { folder: '/elsewhere' }),
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: t('rules.wizard.folderDialogTitle') });
    await userEvent.click(await within(dialog).findByRole('option', { name: 'Projects' }));
    await userEvent.click(
      within(dialog).getByRole('button', { name: t('rules.wizard.folderChoose') }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: t('rules.import.remap', { folder: '/elsewhere' }) }),
      ).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: t('rules.import.confirm') })).toBeEnabled();
    });
  });

  it('cancelling the remap seletor leaves the row still needing a remap', async () => {
    fakeWorkspaceApi({
      roots: [projects],
      directories: (asked) => aListing(projects, asked.get('path') ?? projects.path, []),
    });
    const rules = [{ ...RULES[0]!, scope: 'project', projectPath: '/elsewhere' }];
    mockImportApi({ previewItems: previewItemsFor(rules) });
    renderDialog();
    await chooseFile(fileOf(rules));

    await userEvent.click(
      await screen.findByRole('button', {
        name: t('rules.import.remap', { folder: '/elsewhere' }),
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: t('rules.wizard.folderDialogTitle') });
    await userEvent.click(
      within(dialog).getByRole('button', { name: t('rules.wizard.folderCancel') }),
    );

    expect(screen.queryByRole('dialog', { name: t('rules.wizard.folderDialogTitle') })).toBeNull();
    expect(
      screen.getByRole('button', { name: t('rules.import.remap', { folder: '/elsewhere' }) }),
    ).toBeInTheDocument();
  });

  it('excludes an unchecked row from `accept`, confirms with digest, folderMap and expiresAt', async () => {
    fakeWorkspaceApi({ roots: [projects] });
    const { post } = mockImportApi({});
    const { onApplied } = renderDialog();
    await chooseFile();
    await pickFirstValidityShortcut();

    const checkboxes = await screen.findAllByRole('checkbox');
    await userEvent.click(checkboxes[0]!);

    await userEvent.click(screen.getByRole('button', { name: t('rules.import.confirm') }));

    await waitFor(() => {
      expect(onApplied).toHaveBeenCalled();
    });
    const [, body] = post.mock.calls.find(
      ([path]: [unknown]) => path === '/permission-rules/import',
    )!;
    const sent = body as {
      accept: readonly number[];
      digest: string;
      folderMap: Record<string, string>;
      expiresAt: string;
    };
    expect(sent.accept).toEqual([1]);
    expect(sent.digest).toBe('sha-fixed');
    expect(sent.folderMap).toEqual({});
    expect(sent.expiresAt).toEqual(expect.any(String));
  });

  it('confirms, toasts the count, and calls onApplied, closing the dialog', async () => {
    fakeWorkspaceApi({ roots: [projects] });
    const applyResult = { counts: { created: 2, existing: 0 }, rules: [] };
    mockImportApi({ applyResult });
    const { onApplied, onOpenChange } = renderDialog();
    await chooseFile();
    await pickFirstValidityShortcut();

    await userEvent.click(screen.getByRole('button', { name: t('rules.import.confirm') }));

    expect(
      await screen.findByText(t('rules.import.appliedToast', { count: 2 })),
    ).toBeInTheDocument();
    expect(onApplied).toHaveBeenCalledWith(applyResult);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows the translated failure for a rejected preview — an oversized file, S-208', async () => {
    fakeWorkspaceApi({ roots: [projects] });
    mockImportApi({
      previewError: {
        code: 'PAYLOAD_TOO_LARGE',
        messageKey: 'permission.error.ruleImportTooLarge',
        params: { limit: 500, reason: 'rules' },
      },
    });
    renderDialog();
    await chooseFile();

    expect(
      await screen.findByText(
        t('permission.error.ruleImportTooLarge', { limit: 500, reason: 'rules' }),
      ),
    ).toBeInTheDocument();
  });

  it('shows the per-item rejection reasons, closes nothing, and creates nothing — S-207', async () => {
    const applyError = {
      code: 'PERMISSION_RULE_IMPORT_REJECTED',
      messageKey: 'permission.error.ruleImportRejected',
      params: {},
      details: [{ field: 'rules[0]', rule: 'ALREADY_REVOKED' }],
    };
    fakeWorkspaceApi({ roots: [projects] });
    mockImportApi({});
    const { onOpenChange, onApplied } = renderDialog();
    await chooseFile();
    await pickFirstValidityShortcut();
    mockImportApi({ applyError });

    await userEvent.click(screen.getByRole('button', { name: t('rules.import.confirm') }));

    expect(
      await screen.findByText(
        t('rules.import.rejectedItem', { field: 'rules[0]', rule: 'ALREADY_REVOKED' }),
      ),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('goes back to the chooser, and reads nothing stale from the previous file', async () => {
    fakeWorkspaceApi({ roots: [projects] });
    mockImportApi({});
    renderDialog();
    await chooseFile();

    expect(await screen.findByText('shell(pnpm test:*)')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: t('rules.import.chooseDifferent') }));

    expect(screen.getByText(t('rules.import.chooseFile'))).toBeInTheDocument();
    expect(screen.queryByText('shell(pnpm test:*)')).not.toBeInTheDocument();
  });
});

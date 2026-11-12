import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApplyTemplateDialog } from '@/features/permission/components/ApplyTemplateDialog';
import type { RuleImportResult, RuleTemplates } from '@/features/permission/types/rule';
import { Toaster } from '@/shared/components/ui/sonner';
import { api } from '@/shared/api/api';
import { render, translator } from '../../../support/render';
import { aListing, fakeWorkspaceApi, projects } from '../../../support/workspace-api';

const t = translator('en');

afterEach(() => {
  // Each test sets its own `vi.spyOn(api, ...)` implementation fresh — without restoring, an
  // already-spied method's own `.mock.calls` keeps every earlier test's calls too, and a `.find`
  // over them can match a stale one instead of this test's own.
  vi.restoreAllMocks();
});

/** A message key this suite made up, never one of the dialog's own — i18next's own fallback for a
 * key missing from the catalog is the key itself, so this still renders readable, stable text,
 * guaranteed never to collide with any of the dialog's own fixed strings (`rules.templates.*`). */
const NAME = { messageKey: 'test.fixture.templateName', params: {} };
const DESCRIPTION = { messageKey: 'test.fixture.templateDescription', params: {} };

const TEMPLATE: RuleTemplates['templates'][number] = {
  id: 'tpl-tests',
  name: NAME,
  description: DESCRIPTION,
  rules: [
    {
      pattern: 'shell(pnpm test:*)',
      decision: 'allow',
      reach: { kind: 'shell', form: 'prefix', content: 'pnpm test', excludesCompound: false },
      breadth: 'narrow',
    },
    {
      pattern: 'shell(npm test:*)',
      decision: 'allow',
      reach: { kind: 'shell', form: 'prefix', content: 'npm test', excludesCompound: false },
      breadth: 'narrow',
    },
  ],
};

function previewItemsFor(
  rules: RuleTemplates['templates'][number]['rules'],
  overrides: Partial<Record<number, Partial<Record<string, unknown>>>> = {},
): readonly Record<string, unknown>[] {
  return rules.map((rule, index) => ({
    index,
    pattern: rule.pattern,
    decision: rule.decision,
    scope: 'always',
    verdict: 'new',
    breadth: rule.breadth,
    ...overrides[index],
  }));
}

/** `api.post`, answering the preview and the apply routes — by path, as every sibling spec in this
 * feature does. The caller sets up `api.get` separately (plain for most tests, `fakeWorkspaceApi`
 * for the one that also needs `/workspaces/*` — the two must never both call `vi.spyOn(api, 'get')`
 * themselves, since the later call replaces the earlier one's handler outright). */
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
        items: options.previewItems ?? previewItemsFor(TEMPLATE.rules),
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
  vi.spyOn(api, 'get').mockResolvedValue({ templates: [TEMPLATE] });
  render(
    <>
      <Toaster containerAriaLabel="toasts" />
      <ApplyTemplateDialog open onOpenChange={onOpenChange} onApplied={onApplied} />
    </>,
  );
  return { onOpenChange, onApplied };
}

async function pickTheOnlyTemplate(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: t('rules.templates.pick') }));
}

async function chooseAlwaysScope(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: t('rules.scope.always') }));
}

async function pickFirstValidityShortcut(): Promise<void> {
  await userEvent.click(
    await screen.findByRole('button', { name: t('permission.ruleExpiry.shortcut7') }),
  );
}

describe('ApplyTemplateDialog — "Modelos" (plan 15, B-30, D-16)', () => {
  it('reads nothing while closed, and the catalog only once opened', () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ templates: [TEMPLATE] });
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <ApplyTemplateDialog open={false} onOpenChange={onOpenChange} onApplied={vi.fn()} />,
    );

    expect(get).not.toHaveBeenCalled();

    rerender(<ApplyTemplateDialog open onOpenChange={onOpenChange} onApplied={vi.fn()} />);

    expect(get).toHaveBeenCalledWith('/permission-rules/templates');
  });

  it('shows every template’s own name, description and rules in the catalog', async () => {
    mockImportApi({});
    renderDialog();

    expect(await screen.findByText(NAME.messageKey)).toBeInTheDocument();
    expect(screen.getByText(DESCRIPTION.messageKey)).toBeInTheDocument();
    expect(screen.getByText('shell(pnpm test:*)')).toBeInTheDocument();
    expect(screen.getByText('shell(npm test:*)')).toBeInTheDocument();
  });

  it('asks the preview for an `always`-scoped file, once scope is picked', async () => {
    const { post } = mockImportApi({});
    renderDialog();
    await pickTheOnlyTemplate();

    await chooseAlwaysScope();

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/permission-rules/import/preview',
        expect.objectContaining({ file: expect.any(String) }),
      );
    });
    const [, body] = post.mock.calls.find(
      ([path]: [unknown]) => path === '/permission-rules/import/preview',
    )!;
    const file = JSON.parse((body as { file: string }).file) as {
      format: string;
      rules: readonly { pattern: string; scope: string; projectPath: string | null }[];
    };
    expect(file.format).toBe('remote-claude.permission-rules');
    expect(file.rules).toEqual([
      expect.objectContaining({
        pattern: 'shell(pnpm test:*)',
        scope: 'always',
        projectPath: null,
      }),
      expect.objectContaining({ pattern: 'shell(npm test:*)', scope: 'always', projectPath: null }),
    ]);
  });

  it('excludes an unchecked rule from `accept`, and includes a left-checked `existing` one', async () => {
    const { post } = mockImportApi({
      previewItems: previewItemsFor(TEMPLATE.rules, { 1: { verdict: 'existing' } }),
    });
    const { onApplied } = renderDialog();
    await pickTheOnlyTemplate();
    await chooseAlwaysScope();

    expect(await screen.findByText(t('rules.templates.verdictExisting'))).toBeInTheDocument();

    const checkboxes = await screen.findAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    await userEvent.click(checkboxes[0]!);
    expect(checkboxes[0]).not.toBeChecked();
    // Re-checking it puts it back — toggling is never one-way.
    await userEvent.click(checkboxes[0]!);
    expect(checkboxes[0]).toBeChecked();
    await userEvent.click(checkboxes[0]!);

    await pickFirstValidityShortcut();
    await userEvent.click(screen.getByRole('button', { name: t('rules.templates.confirm') }));

    await waitFor(() => {
      expect(onApplied).toHaveBeenCalled();
    });
    const [, body] = post.mock.calls.find(
      ([path]: [unknown]) => path === '/permission-rules/import',
    )!;
    expect((body as { accept: readonly number[] }).accept).toEqual([1]);
  });

  it('forces an `invalid` item unchecked, disabled, and out of `accept`', async () => {
    const { post } = mockImportApi({
      previewItems: previewItemsFor(TEMPLATE.rules, {
        0: { verdict: 'invalid', breadth: undefined, code: 'INVALID_INPUT' },
      }),
    });
    renderDialog();
    await pickTheOnlyTemplate();
    await chooseAlwaysScope();

    const invalidLabel = await screen.findByText(t('rules.templates.verdictInvalid'));
    const row = invalidLabel.closest('li')!;
    const checkbox = within(row).getByRole('checkbox');
    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();

    await pickFirstValidityShortcut();
    await userEvent.click(screen.getByRole('button', { name: t('rules.templates.confirm') }));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/permission-rules/import', expect.anything());
    });
    const [, body] = post.mock.calls.find(
      ([path]: [unknown]) => path === '/permission-rules/import',
    )!;
    expect((body as { accept: readonly number[] }).accept).toEqual([1]);
  });

  it('forces an unbounded `allow` item unchecked, disabled, and out of `accept` — D-09', async () => {
    mockImportApi({
      previewItems: previewItemsFor(TEMPLATE.rules, {
        0: { decision: 'allow', breadth: 'unbounded' },
      }),
    });
    renderDialog();
    await pickTheOnlyTemplate();
    await chooseAlwaysScope();

    const blockedLabel = await screen.findByText(t('rules.templates.unboundedBlocked'));
    const row = blockedLabel.closest('li')!;
    const checkbox = within(row).getByRole('checkbox');
    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();
  });

  it('needs a folder, not just a scope, before Confirm enables for a `project`-scoped batch', async () => {
    // `fakeWorkspaceApi` owns `api.get` here (routing `/permission-rules/templates` through its
    // own `other` callback) — `renderDialog` would otherwise replace its `/workspaces/*` handling
    // outright, the last `vi.spyOn(api, 'get')` call always winning over an earlier one.
    fakeWorkspaceApi({
      roots: [projects],
      directories: (asked) => aListing(projects, asked.get('path') ?? projects.path, []),
      other: (path) =>
        path === '/permission-rules/templates' ? { templates: [TEMPLATE] } : undefined,
    });
    mockImportApi({});
    const onOpenChange = vi.fn();
    render(
      <>
        <Toaster containerAriaLabel="toasts" />
        <ApplyTemplateDialog open onOpenChange={onOpenChange} onApplied={vi.fn()} />
      </>,
    );
    await pickTheOnlyTemplate();

    await userEvent.click(screen.getByRole('button', { name: t('rules.scope.project') }));
    await pickFirstValidityShortcut();

    expect(screen.getByRole('button', { name: t('rules.templates.confirm') })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: t('rules.wizard.folderChoose') }));
    const firstOpen = await screen.findByRole('dialog', {
      name: t('rules.wizard.folderDialogTitle'),
    });
    await userEvent.click(
      within(firstOpen).getByRole('button', { name: t('rules.wizard.folderCancel') }),
    );
    expect(screen.queryByRole('dialog', { name: t('rules.wizard.folderDialogTitle') })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: t('rules.wizard.folderChoose') }));
    const dialog = await screen.findByRole('dialog', { name: t('rules.wizard.folderDialogTitle') });
    await userEvent.click(await within(dialog).findByRole('option', { name: 'Projects' }));
    await userEvent.click(
      within(dialog).getByRole('button', { name: t('rules.wizard.folderChoose') }),
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: t('rules.templates.confirm') })).toBeEnabled();
    });
  });

  it('needs the acknowledgement for an accepted broad item, and stops needing it once excluded', async () => {
    mockImportApi({
      previewItems: previewItemsFor(TEMPLATE.rules, { 0: { breadth: 'broad' } }),
    });
    renderDialog();
    await pickTheOnlyTemplate();
    await chooseAlwaysScope();
    await pickFirstValidityShortcut();

    await screen.findByText(t('rules.templates.acknowledgeBroad'));
    expect(screen.getByRole('button', { name: t('rules.templates.confirm') })).toBeDisabled();

    const checkboxes = screen.getAllByRole('checkbox');
    // The broad rule's own row is the first of the two rule checkboxes.
    await userEvent.click(checkboxes[0]!);

    await waitFor(() => {
      expect(screen.queryByText(t('rules.templates.acknowledgeBroad'))).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: t('rules.templates.confirm') })).toBeEnabled();
  });

  it('confirms once acknowledged, and sends the broad index along', async () => {
    const { post } = mockImportApi({
      previewItems: previewItemsFor(TEMPLATE.rules, { 0: { breadth: 'broad' } }),
    });
    renderDialog();
    await pickTheOnlyTemplate();
    await chooseAlwaysScope();
    await pickFirstValidityShortcut();
    await screen.findByText(t('rules.templates.acknowledgeBroad'));

    // The two rule checkboxes come first in the DOM; the acknowledgement's own is the last one.
    const checkboxes = screen.getAllByRole('checkbox');
    await userEvent.click(checkboxes[checkboxes.length - 1]!);
    expect(checkboxes[checkboxes.length - 1]).toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: t('rules.templates.confirm') }));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/permission-rules/import', expect.anything());
    });
    const [, body] = post.mock.calls.find(
      ([path]: [unknown]) => path === '/permission-rules/import',
    )!;
    expect((body as { acknowledgeBroad: readonly number[] }).acknowledgeBroad).toEqual([0]);
  });

  it('confirms with the right digest and validity, toasts the count, and calls onApplied', async () => {
    const applyResult = { counts: { created: 2, existing: 0 }, rules: [] };
    const { post } = mockImportApi({ applyResult });
    const { onApplied } = renderDialog();
    await pickTheOnlyTemplate();
    await chooseAlwaysScope();
    await pickFirstValidityShortcut();

    await userEvent.click(screen.getByRole('button', { name: t('rules.templates.confirm') }));

    expect(
      await screen.findByText(t('rules.templates.appliedToast', { count: 2 })),
    ).toBeInTheDocument();
    expect(onApplied).toHaveBeenCalledWith(applyResult);
    const [, body] = post.mock.calls.find(
      ([path]: [unknown]) => path === '/permission-rules/import',
    )!;
    expect((body as { digest: string }).digest).toBe('sha-fixed');
    expect((body as { expiresAt: string }).expiresAt).toEqual(expect.any(String));
  });

  it('shows the translated failure for a rejected preview', async () => {
    mockImportApi({
      previewError: { code: 'INTERNAL_ERROR', messageKey: 'common.error.unexpected', params: {} },
    });
    renderDialog();
    await pickTheOnlyTemplate();
    await chooseAlwaysScope();

    expect(await screen.findByText(t('common.error.unexpected'))).toBeInTheDocument();
  });

  it('shows the translated failure for a rejected apply, and does not close', async () => {
    const { onOpenChange } = renderDialog();
    mockImportApi({
      applyError: { code: 'INTERNAL_ERROR', messageKey: 'common.error.unexpected', params: {} },
    });
    await pickTheOnlyTemplate();
    await chooseAlwaysScope();
    await pickFirstValidityShortcut();

    await userEvent.click(screen.getByRole('button', { name: t('rules.templates.confirm') }));

    expect(await screen.findByText(t('common.error.unexpected'))).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('goes back to the catalog, from the review', async () => {
    mockImportApi({});
    renderDialog();
    await pickTheOnlyTemplate();

    expect(await screen.findByText(t('rules.templates.rulesHeading'))).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: t('rules.templates.back') }));

    expect(
      await screen.findByRole('button', { name: t('rules.templates.pick') }),
    ).toBeInTheDocument();
    expect(screen.queryByText(t('rules.templates.rulesHeading'))).not.toBeInTheDocument();
  });
});

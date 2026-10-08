import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import { axe } from 'jest-axe';

import { PermissionCard } from '@/features/permission/components/PermissionCard';
import type { PermissionRequest } from '@/features/permission/types/permission';
import { FOLDER } from '../../../support/editor';
import { fakeDisk } from '../../../support/editor-disk';
import { render, translator } from '../../../support/render';
import { aWireError, routeApi } from '../../../support/session-tools';

const t = translator('en');

function aRequest(toolName: string, input: Record<string, unknown>): PermissionRequest {
  return {
    requestId: `req-${toolName}`,
    frameId: 'frame-1',
    toolUseId: 'toolu_1',
    toolName,
    description: JSON.stringify(input),
    input,
    riskHint: 'write',
    defaultToNo: true,
    expiresAt: '2026-10-01T12:02:00.000Z',
    suggestions: [{ scope: 'once', labelKey: 'permission.scope.once', rule: null }],
    reaches: [],
    interaction: null,
    isAnswering: false,
  };
}

function show(request: PermissionRequest, folder: string | null = FOLDER) {
  return render(
    <ul>
      <PermissionCard
        request={request}
        remainingMs={60_000}
        onAnswer={vi.fn()}
        onExtend={vi.fn()}
        folder={folder}
      />
    </ul>,
  );
}

const preview = () => screen.findByRole('group', { name: t('permission.preview.label') });

afterEach(() => {
  vi.restoreAllMocks();
  act(() => {
    focusManager.setFocused(undefined);
  });
});

/** The card that asks shows what an edit would do, before it is approved — plan 08, B-29. */
describe('the preview of a change on the card that asks', () => {
  it('shows an edit against the disk now, and says when — S-127', async () => {
    fakeDisk(FOLDER, { 'src/a.ts': 'one\ntwo\nthree\n' });
    show(
      aRequest('Edit', { file_path: `${FOLDER}/src/a.ts`, old_string: 'two', new_string: 'TWO' }),
    );

    const diff = await preview();
    expect(within(diff).getByText('two')).toBeInTheDocument();
    expect(within(diff).getByText('TWO')).toBeInTheDocument();
    expect(screen.getByText(/Preview against the file as it was at/)).toBeVisible();
  });

  it('shows the write of a new file as all added — S-128', async () => {
    fakeDisk(FOLDER, {});
    show(aRequest('Write', { file_path: `${FOLDER}/new.md`, content: 'hello\n' }));

    expect(within(await preview()).getByText('hello')).toBeInTheDocument();
  });

  it('says an edit will not match the file now, and invents nothing — S-129', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'nothing like it' });
    show(aRequest('Edit', { file_path: `${FOLDER}/a.ts`, old_string: 'two', new_string: 'TWO' }));

    expect(await screen.findByText(t('permission.preview.noMatch', { edit: 1 }))).toBeVisible();
    expect(screen.queryByRole('group', { name: t('permission.preview.label') })).toBeNull();
  });

  it('says a large or binary file has no preview, and keeps the exact input in view — S-130', async () => {
    routeApi({
      [`/files/content?folder=${encodeURIComponent(FOLDER)}&path=big.bin`]: [
        aWireError('FILE_NOT_TEXT', 'files.error.notText'),
      ],
    });
    show(aRequest('Edit', { file_path: `${FOLDER}/big.bin`, old_string: 'a', new_string: 'b' }));

    expect(
      await screen.findByText(
        t('permission.preview.unavailable', { reason: t('files.error.notText') }),
      ),
    ).toBeVisible();
    expect(screen.getByText(/"old_string":"a"/)).toBeVisible();
  });

  it('reads the disk again when the window gets the focus back — S-131', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'one\n' });
    show(aRequest('Edit', { file_path: `${FOLDER}/a.ts`, old_string: 'one', new_string: 'ONE' }));
    await preview();

    disk.files.set('a.ts', { content: 'changed\n' });
    act(() => {
      focusManager.setFocused(false);
    });
    act(() => {
      focusManager.setFocused(true);
    });

    expect(await screen.findByText(t('permission.preview.noMatch', { edit: 1 }))).toBeVisible();
  });

  it('says a file outside the folder of the tab has no preview, and shows none for a command', async () => {
    show(aRequest('Write', { file_path: '/elsewhere/a.md', content: 'x' }));
    expect(screen.getByText(t('permission.preview.outside'))).toBeVisible();

    show(aRequest('Bash', { command: 'ls' }));
    show(aRequest('Write', { file_path: `${FOLDER}/a.md`, content: 'x' }), null);
    expect(screen.getAllByText(t('permission.preview.outside'))).toHaveLength(1);
  });

  it('says when a write would change nothing', async () => {
    fakeDisk(FOLDER, { 'a.md': 'same' });
    show(aRequest('Write', { file_path: `${FOLDER}/a.md`, content: 'same' }));

    expect(await screen.findByText(t('permission.preview.unchanged'))).toBeVisible();
  });

  it('has no accessibility violation', async () => {
    fakeDisk(FOLDER, { 'a.ts': 'one\n' });
    const { container } = show(
      aRequest('Edit', { file_path: `${FOLDER}/a.ts`, old_string: 'one', new_string: 'ONE' }),
    );
    await preview();

    expect(await axe(container)).toHaveNoViolations();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { explorerStore } from '@/features/explorer';
import { forgetTimeline } from '@/features/file-history';
import { onNotify } from '@/shared/lib/notify';
import type { Notification } from '@/shared/lib/notify';
import { resetEditorFake } from '../../../support/editor-fake';
import { APP, renderExplorer, row } from '../../../support/explorer';
import { filesRefusal } from '../../../support/files-api';
import type { FakeCall } from '../../../support/files-api';
import { FakeHistory } from '../../../support/history-api';
import { translator } from '../../../support/render';

vi.mock('@/features/editor', async () => (await import('../../../support/editor-fake')).editorFake);

const t = translator('en');

/** What the notification centre was told, in order — the toast's "Undo" is run from here. */
let told: Notification[] = [];
let stopListening = (): void => undefined;

beforeEach(() => {
  told = [];
  stopListening = onNotify((notification) => {
    told.push(notification);
  });
});

afterEach(() => {
  stopListening();
  vi.restoreAllMocks();
  resetEditorFake();
  forgetTimeline(null);
});

/** Puts the keyboard on a row, as a click does without opening it. */
async function onRow(name: string): Promise<HTMLElement> {
  const item = await row(name);
  act(() => {
    item.focus();
  });
  return item;
}

function keptInHistory(call: FakeCall): boolean {
  return call.query.get('keepInHistory') === 'true';
}

/** Runs the "Undo" of the last notification, as its toast's button does. */
function undoLast(): void {
  const undo = told.at(-1)?.actions?.[0];

  expect(undo?.labelKey).toBe('explorer.delete.undo');
  act(() => {
    undo?.run();
  });
}

describe('deleting what fits in the local history — plan 07, B-58, S-344', () => {
  it('asks nothing, says what went with Undo — and Undo brings back the whole batch, folders first', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    const { disk } = renderExplorer(
      { 'src/a.ts': 'a', 'src/lib/b.ts': 'b', 'z.ts': 'z' },
      { history },
    );
    await onRow('src');

    await user.keyboard('{Delete}');

    await waitFor(() => {
      expect(screen.queryByRole('treeitem', { name: 'src' })).toBeNull();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    const [deletion] = disk.callsTo('DELETE', '/files');
    expect(deletion?.query.get('keepInHistory')).toBe('true');
    expect(deletion?.query.get('path')).toBe('src');
    expect(told.at(-1)).toMatchObject({
      severity: 'info',
      messageKey: 'notification.files.deletedOne',
      params: { name: 'src' },
    });
    expect(disk.entries.has('src/lib/b.ts')).toBe(false);

    undoLast();

    await waitFor(() => {
      expect(disk.entries.get('src/lib/b.ts')?.content).toBe('b');
    });
    expect(disk.entries.get('src/a.ts')?.content).toBe('a');
    const order = disk.calls
      .filter((call) => call.route.endsWith('/restore'))
      .map((call) => history.entries.find((entry) => call.route.includes(`/${entry.id}/`))?.path);
    expect(order).toEqual(['src', 'src/lib', 'src/a.ts', 'src/lib/b.ts']);
    expect(await row('src')).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says many entries went with one notification, and undoes once however often it is pressed', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    const { disk } = renderExplorer({ 'a.ts': 'a', 'b.ts': 'b', 'c.ts': 'c' }, { history });
    await user.click(await row('a.ts'));
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');

    await user.keyboard('{Delete}');

    await waitFor(() => {
      expect(screen.queryByRole('treeitem', { name: 'b.ts' })).toBeNull();
    });
    expect(told.at(-1)).toMatchObject({
      messageKey: 'notification.files.deletedMany',
      params: { count: 2 },
    });

    const undo = told.at(-1)?.actions?.[0];
    act(() => {
      undo?.run();
      undo?.run();
    });

    await waitFor(() => {
      expect(disk.entries.has('b.ts')).toBe(true);
    });
    expect(disk.calls.filter((call) => call.route.endsWith('/restore'))).toHaveLength(2);
    expect(await screen.findByText(t('explorer.done.restored', { count: 2 }))).toBeInTheDocument();
  });

  it('shows what did not come back, and why, on the outcome screen', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    const { disk } = renderExplorer({ 'a.ts': 'a', 'b.ts': 'b' }, { history });
    await user.click(await row('a.ts'));
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    await user.keyboard('{Delete}');
    await waitFor(() => {
      expect(disk.entries.has('a.ts')).toBe(false);
    });
    disk.put('a.ts', 'made again since');

    undoLast();

    const outcome = await screen.findByRole('dialog', {
      name: t('explorer.outcome.undoDeleteFailed'),
    });
    expect(outcome).toHaveTextContent(t('explorer.undo.taken', { path: 'a.ts' }));
    expect(outcome).toHaveTextContent(t('explorer.outcome.done'));
    expect(disk.entries.get('a.ts')?.content).toBe('made again since');
    expect(disk.entries.get('b.ts')?.content).toBe('b');
  });

  it('asks the second step once for a file that changes what Claude may do, then keeps it', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    const { disk } = renderExplorer({ '.mcp.json': '{}' }, { history });
    await onRow('.mcp.json');

    await user.keyboard('{Delete}');
    const step = await screen.findByRole('dialog', { name: t('explorer.sensitive.title') });
    await user.click(within(step).getByRole('button', { name: t('explorer.sensitive.confirm') }));

    await waitFor(() => {
      expect(disk.entries.has('.mcp.json')).toBe(false);
    });
    const deletes = disk.callsTo('DELETE', '/files');
    expect(deletes.every(keptInHistory)).toBe(true);
    expect(deletes.at(-1)?.query.get('confirmSensitive')).toBe('true');
    expect(told.at(-1)?.messageKey).toBe('notification.files.deletedOne');

    undoLast();
    const again = await screen.findByRole('dialog', { name: t('explorer.sensitive.title') });
    await user.click(within(again).getByRole('button', { name: t('explorer.sensitive.confirm') }));
    await waitFor(() => {
      expect(disk.entries.get('.mcp.json')?.content).toBe('{}');
    });
  });
});

describe('deleting what does not fit in the local history — plan 07, S-337', () => {
  it('asks for good, saying why there is no undo this time, and sends the definitive delete', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    history.tooLarge.add('big.bin');
    const { disk } = renderExplorer({ 'big.bin': 'x', 'small.ts': 's' }, { history });
    act(() => {
      explorerStore(APP).getState().select(['big.bin', 'small.ts'], 'small.ts');
    });
    await onRow('small.ts');

    await user.keyboard('{Delete}');

    const dialog = await screen.findByRole('dialog', {
      name: t('explorer.delete.titleOne', { path: 'big.bin' }),
    });
    expect(dialog).toHaveTextContent(t('explorer.delete.forGood'));
    expect(dialog).toHaveTextContent(t('explorer.delete.whyTooLarge', { path: 'big.bin' }));
    expect(disk.entries.has('big.bin')).toBe(true);
    expect(disk.entries.has('small.ts')).toBe(false);
    expect(told.at(-1)?.params).toEqual({ name: 'small.ts' });

    await user.click(within(dialog).getByRole('button', { name: t('explorer.delete.confirm') }));
    await waitFor(() => {
      expect(disk.entries.has('big.bin')).toBe(false);
    });
    const last = disk.callsTo('DELETE', '/files').at(-1);
    expect(last?.query.get('keepInHistory')).toBeNull();
    expect(last?.query.get('path')).toBe('big.bin');
  });

  it('keeps the count and the second step for a folder it could not keep', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    history.tooLarge.add('full');
    const { disk } = renderExplorer({ 'full/a.ts': 'a', 'full/b.ts': 'b' }, { history });
    await onRow('full');

    await user.keyboard('{Delete}');
    const dialog = await screen.findByRole('dialog', {
      name: t('explorer.delete.titleOne', { path: 'full' }),
    });
    expect(dialog).toHaveTextContent(t('explorer.delete.whyTooLarge', { path: 'full' }));
    await user.click(within(dialog).getByRole('button', { name: t('explorer.delete.confirm') }));
    expect(
      await screen.findByText(t('explorer.delete.holds', { path: 'full', count: 2 })),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: t('explorer.delete.confirm') }));

    await waitFor(() => {
      expect(disk.entries.has('full')).toBe(false);
    });
    expect(disk.callsTo('DELETE', '/files').at(-1)?.query.get('expectedEntries')).toBe('2');
  });

  it('says the history is unavailable — and a reason it does not know the same way', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'a.ts': 'a', 'b.ts': 'b' });
    disk.refuseNext(
      (call) => call.query.get('path') === 'a.ts' && keptInHistory(call),
      filesRefusal('PRECONDITION_REQUIRED', 'files.error.preconditionRequired', {
        path: 'a.ts',
        reason: 'notKept',
        why: 'aReasonFromLater',
      }),
    );
    disk.refuseNext(
      (call) => call.query.get('path') === 'b.ts' && keptInHistory(call),
      filesRefusal('PRECONDITION_REQUIRED', 'files.error.preconditionRequired', {
        path: 'b.ts',
        reason: 'notKept',
      }),
    );
    await user.click(await row('a.ts'));
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');

    await user.keyboard('{Delete}');

    const dialog = await screen.findByRole('dialog', {
      name: t('explorer.delete.titleMany', { count: 2 }),
    });
    expect(dialog).toHaveTextContent(t('explorer.delete.whyUnavailable', { path: 'a.ts' }));
    expect(dialog).toHaveTextContent(t('explorer.delete.whyUnavailable', { path: 'b.ts' }));
    await user.click(within(dialog).getByRole('button', { name: t('explorer.delete.keep') }));
    expect(disk.entries.has('a.ts')).toBe(true);
  });

  it('tells what failed while keeping, with what else was deleted for good', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'a.ts': 'a', 'b.ts': 'b' });
    disk.refuseNext(
      (call) => call.query.get('path') === 'a.ts' && keptInHistory(call),
      filesRefusal('FILE_NOT_FOUND', 'files.error.notFound', { path: 'a.ts' }),
    );
    await user.click(await row('a.ts'));
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    await user.keyboard('{Delete}');

    await user.click(
      within(
        await screen.findByRole('dialog', {
          name: t('explorer.delete.titleOne', { path: 'b.ts' }),
        }),
      ).getByRole('button', { name: t('explorer.delete.confirm') }),
    );

    const outcome = await screen.findByRole('dialog', { name: t('explorer.outcome.deleteFailed') });
    expect(outcome).toHaveTextContent(t('files.error.notFound', { path: 'a.ts' }));
    expect(disk.entries.has('b.ts')).toBe(false);
  });
});

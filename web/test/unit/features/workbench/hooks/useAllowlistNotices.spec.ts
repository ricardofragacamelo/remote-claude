import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useAllowlistNotices } from '@/features/workbench/hooks/useAllowlistNotices';
import type { OpenFolder } from '@/features/workspace';
import { onNotify } from '@/shared/lib/notify';
import type { Notification } from '@/shared/lib/notify';

const A = '/srv/projects/a';
const B = '/srv/projects/b';

function aFolder(path: string, state: OpenFolder['state']): OpenFolder {
  return { path, rootLabel: 'Projects', state };
}

function watching(initial: readonly OpenFolder[]) {
  const told: Notification[] = [];
  const stop = onNotify((notification) => told.push(notification));
  const hook = renderHook(
    ({ folders }) => {
      useAllowlistNotices(folders);
    },
    { initialProps: { folders: initial } },
  );
  return { told, stop, ...hook };
}

describe('a folder that stops being allowed — plan 06, S-194', () => {
  it('is told once, with its path, when the tabs read again show it', () => {
    const { told, stop, rerender } = watching([aFolder(A, 'available'), aFolder(B, 'available')]);

    rerender({ folders: [aFolder(A, 'notAllowed'), aFolder(B, 'available')] });
    rerender({ folders: [aFolder(A, 'notAllowed'), aFolder(B, 'available')] });

    expect(told).toEqual([
      { severity: 'warning', messageKey: 'notification.folder.notAllowed', params: { folder: A } },
    ]);
    stop();
  });

  it('is not told when it was already out on the first read, nor when it left the disk', () => {
    const { told, stop, rerender } = watching([aFolder(A, 'notAllowed'), aFolder(B, 'available')]);

    rerender({ folders: [aFolder(A, 'notAllowed'), aFolder(B, 'missing')] });
    rerender({
      folders: [aFolder(A, 'notAllowed'), aFolder(B, 'missing'), aFolder('/c', 'notAllowed')],
    });

    expect(told).toEqual([]);
    stop();
  });
});

import { describe, expect, it } from 'vitest';

import { toEntity, toRow } from '@adapter/outbound/persistence/workspace/workspace-folder.mapper';
import { aFolder, OPENED_AT } from '../../../../../support/builders/workspace-folder.builder';

const now = new Date('2026-09-28T13:00:00.000Z');

describe('the workspace folder mapper', () => {
  it('turns an entity into a row and back without losing anything', () => {
    const folder = aFolder({ pinned: true, tabPosition: 3 });
    const row = toRow(folder, now);

    expect(row).toEqual({
      userId: 'auth|owner',
      path: '/srv/projects/app',
      rootPath: '/srv/projects',
      lastOpenedAt: OPENED_AT,
      isPinned: true,
      tabPosition: 3,
      updatedAt: now,
    });
    expect(
      toEntity({
        ...row,
        lastOpenedAt: OPENED_AT,
        isPinned: true,
        tabPosition: 3,
        createdAt: now,
        updatedAt: now,
      }).snapshot(),
    ).toEqual(folder.snapshot());
  });

  it('keeps a folder taken off the recent list, with its tab open', () => {
    const folder = aFolder({ lastOpenedAt: null, tabPosition: 0 });

    expect(toRow(folder, now)).toMatchObject({ lastOpenedAt: null, tabPosition: 0 });
  });
});

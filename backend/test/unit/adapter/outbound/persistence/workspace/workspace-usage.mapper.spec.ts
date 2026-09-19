import { describe, expect, it } from 'vitest';

import { toEntity, toRow } from '@adapter/outbound/persistence/workspace/workspace-usage.mapper';
import { UserId } from '@domain/auth';
import { WorkspacePath, WorkspaceUsage } from '@domain/workspace';

const lastUsedAt = new Date('2026-09-18T10:00:00.000Z');
const now = new Date('2026-09-18T11:00:00.000Z');

const row = {
  userId: 'auth|owner',
  rootPath: '/srv/projects',
  label: 'Projects',
  lastUsedAt,
  createdAt: lastUsedAt,
  updatedAt: lastUsedAt,
};

describe('the workspace usage mapper', () => {
  it('turns a row into an entity', () => {
    expect(toEntity(row).snapshot()).toEqual({
      userId: UserId.create('auth|owner'),
      root: WorkspacePath.create('/srv/projects'),
      label: 'Projects',
      lastUsedAt,
    });
  });

  it('turns an entity into a row', () => {
    const usage = WorkspaceUsage.record(
      UserId.create('auth|owner'),
      WorkspacePath.create('/srv/projects'),
      'Projects',
      lastUsedAt,
    );

    expect(toRow(usage, now)).toEqual({
      userId: 'auth|owner',
      rootPath: '/srv/projects',
      label: 'Projects',
      lastUsedAt,
      updatedAt: now,
    });
  });

  it('stamps the update instant from the caller, never leaving it to a trigger', () => {
    const usage = WorkspaceUsage.record(
      UserId.create('auth|owner'),
      WorkspacePath.create('/srv/projects'),
      'Projects',
      lastUsedAt,
    );

    expect(toRow(usage, now).updatedAt).toEqual(now);
  });

  it('round-trips without losing anything', () => {
    const written = toRow(toEntity(row), now);

    expect(
      toEntity({ ...row, ...written, createdAt: row.createdAt, updatedAt: now }).snapshot(),
    ).toEqual(toEntity(row).snapshot());
  });
});

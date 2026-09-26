import { beforeEach, describe, expect, it } from 'vitest';

import { AUDIT_PURGE_BATCH_SIZE, PurgeAuditTrailUseCase } from '@application/audit';
import type { AuditPurgeReport } from '@application/audit';
import { retentionCutoff } from '@domain/audit';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { InMemoryAuditRetentionStore } from '../../../support/fakes/in-memory-audit-retention.store';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const now = new Date('2026-09-24T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const cutoff = retentionCutoff(now, 90);

/** `days` before now. */
const ago = (days: number): Date => new Date(now.getTime() - days * DAY_MS);

let store: InMemoryAuditRetentionStore;
let ids: SequentialIds;

beforeEach(() => {
  store = new InMemoryAuditRetentionStore();
  ids = new SequentialIds();
});

function aPurge(batchSize = 2): PurgeAuditTrailUseCase {
  return new PurgeAuditTrailUseCase(store, new FixedClock(now), ids, {
    retentionDays: 90,
    batchSize,
  });
}

/** The report of a purge that ran, or a failed test saying it did not. */
function ran(report: AuditPurgeReport): Extract<AuditPurgeReport, { purgeId: string }> {
  if (report.status === 'skipped') {
    throw new Error('the purge was expected to run');
  }
  return report;
}

describe('PurgeAuditTrailUseCase', () => {
  it('removes what is outside the window from both trails — S-34', async () => {
    store.seed('entries', ago(200), ago(120), ago(91));
    store.seed('events', ago(365));

    const report = ran(await aPurge().execute('job'));

    expect(report.status).toBe('completed');
    expect(report.trails).toEqual([
      { trail: 'entries', deleted: 3, failure: null },
      { trail: 'events', deleted: 1, failure: null },
    ]);
    expect(store.rows).toEqual({ entries: [], events: [] });
  });

  it('removes nothing inside the window, and keeps the entry exactly at its edge — S-35, S-36', async () => {
    const edge = cutoff;
    store.seed('entries', ago(1), ago(89), edge, ago(91));

    const report = ran(await aPurge().execute('job'));

    expect(report.trails[0]?.deleted).toBe(1);
    expect(store.rows.entries).toEqual([ago(89), edge, ago(1)].sort((a, b) => +a - +b));
  });

  it('goes batch by batch until one comes back short', async () => {
    store.seed('entries', ago(100), ago(101), ago(102), ago(103), ago(104));

    await aPurge(2).execute('cli');

    expect(store.asked.filter((batch) => batch.trail === 'entries').map((b) => b.limit)).toEqual([
      2, 2, 2,
    ]);
    expect(store.recorded.filter((batch) => batch.trail === 'entries')).toHaveLength(3);
  });

  it('asks once more when the last batch was exactly full, and stops on the empty one', async () => {
    store.seed('entries', ago(100), ago(101), ago(102), ago(103));

    await aPurge(2).execute('cli');

    expect(store.asked.filter((batch) => batch.trail === 'entries')).toHaveLength(3);
    // The empty batch is not recorded: it deleted nothing (D-19).
    expect(store.recorded.filter((batch) => batch.trail === 'entries')).toHaveLength(2);
  });

  it('records each batch with the run, who started it, the window and a fresh id — S-39', async () => {
    store.seed('entries', ago(100), ago(101), ago(102));

    const report = ran(await aPurge(2).execute('cli'));

    expect(store.recorded).toHaveLength(2);
    for (const batch of store.recorded) {
      expect(batch).toMatchObject({
        purgeId: report.purgeId,
        triggeredBy: 'cli',
        trail: 'entries',
        retentionDays: 90,
        cutoff,
        at: now,
      });
    }
    expect(new Set(store.recorded.map((batch) => batch.recordId)).size).toBe(2);
    expect(store.recorded.map((batch) => batch.recordId)).not.toContain(report.purgeId);
  });

  it('uses a thousand rows per batch unless told otherwise', async () => {
    const purge = new PurgeAuditTrailUseCase(store, new FixedClock(now), ids, {
      retentionDays: 90,
    });

    await purge.execute('job');

    expect(store.asked.map((batch) => batch.limit)).toEqual([
      AUDIT_PURGE_BATCH_SIZE,
      AUDIT_PURGE_BATCH_SIZE,
    ]);
    expect(AUDIT_PURGE_BATCH_SIZE).toBe(1_000);
  });

  it('cuts at the configured window when it is longer than the floor', async () => {
    store.seed('entries', ago(100), ago(400));
    const purge = new PurgeAuditTrailUseCase(store, new FixedClock(now), ids, {
      retentionDays: 365,
    });

    const report = ran(await purge.execute('job'));

    expect(report.cutoff).toEqual(retentionCutoff(now, 365));
    expect(report.retentionDays).toBe(365);
    expect(purge.retentionDays).toBe(365);
    expect(store.rows.entries).toEqual([ago(100)]);
  });

  it('runs nothing when another purge holds the lock, and says why — S-51', async () => {
    store.seed('entries', ago(100));
    store.held = true;

    const report = await aPurge().execute('cli');

    expect(report).toEqual({
      status: 'skipped',
      reason: 'alreadyRunning',
      triggeredBy: 'cli',
      retentionDays: 90,
      cutoff,
    });
    expect(store.asked).toEqual([]);
    expect(store.rows.entries).toHaveLength(1);
  });

  it('keeps purging the other trail when one is refused, and reports both — S-87', async () => {
    const refusal = new Error('audit_entries is retained for 90 days: DELETE is refused');
    store.seed('entries', ago(100), ago(101), ago(102));
    store.seed('events', ago(100));
    store.refusal = { trail: 'entries', afterBatches: 1, error: refusal };

    const report = ran(await aPurge(2).execute('job'));

    expect(report.status).toBe('failed');
    expect(report.trails).toEqual([
      { trail: 'entries', deleted: 2, failure: { error: refusal } },
      { trail: 'events', deleted: 1, failure: null },
    ]);
    expect(store.rows.entries).toHaveLength(1);
    expect(store.rows.events).toEqual([]);
  });

  it('removes nothing twice when run again after an interruption — S-37', async () => {
    store.seed('entries', ago(100), ago(101), ago(102), ago(103), ago(104));
    store.refusal = { trail: 'entries', afterBatches: 1, error: new Error('connection lost') };

    const first = ran(await aPurge(2).execute('job'));
    store.refusal = null;
    const second = ran(await aPurge(2).execute('job'));

    expect(first.trails[0]?.deleted).toBe(2);
    expect(second.trails[0]?.deleted).toBe(3);
    expect(store.rows.entries).toEqual([]);
    expect(
      store.recorded.reduce((sum, batch) => sum + (batch.trail === 'entries' ? 1 : 0), 0),
    ).toBe(3);
    expect(first.purgeId).not.toBe(second.purgeId);
  });

  it('finds nothing to do on a trail already within its window — S-86', async () => {
    store.seed('entries', ago(1));

    const report = ran(await aPurge().execute('job'));
    const again = ran(await aPurge().execute('job'));

    expect(report.status).toBe('completed');
    expect(again.trails.map((trail) => trail.deleted)).toEqual([0, 0]);
    expect(store.recorded).toEqual([]);
  });
});

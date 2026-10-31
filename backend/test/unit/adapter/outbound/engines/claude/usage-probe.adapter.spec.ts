import { describe, expect, it } from 'vitest';

import { AgentSdkUsageProbe } from '@adapter/outbound/engines/claude/usage-probe.adapter';
import type { EphemeralClaude } from '@adapter/outbound/engines/claude/ephemeral-claude';
import { WorkspacePath } from '@domain/workspace';
import { FixedClock } from '../../../../../support/fakes/fixed-clock';
import { RecordingLogger } from '../../../../../support/fakes/recording-logger';

const FOLDER = WorkspacePath.create('/srv/app');
const NOW = new Date('2026-10-26T12:00:00.000Z');

/** A fake `EphemeralClaude` whose `ask` either answers or rejects — this probe never looks at `question`. */
function claudeThatAnswers(answer: () => Promise<unknown>): EphemeralClaude {
  const query = { usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: answer };
  const ask: EphemeralClaude['ask'] = (_question, callback) => callback(query as never);
  return { ask } as unknown as EphemeralClaude;
}

describe('the on-demand usage probe, over the experimental SDK call — plan 16, D-09', () => {
  it('reads the windows the probe answered, stamped with the clock’s own time', async () => {
    const claude = claudeThatAnswers(() =>
      Promise.resolve({
        rate_limits: { five_hour: { utilization: 8, resets_at: null } },
      }),
    );
    const logger = new RecordingLogger();
    const probe = new AgentSdkUsageProbe(claude, new FixedClock(NOW), logger.logger);

    const windows = await probe.probe(FOLDER);

    expect(windows).toEqual([
      {
        kind: 'five_hour',
        status: 'allowed',
        utilizationPercent: 8,
        resetsAt: null,
        observedAt: NOW,
      },
    ]);
  });

  it('answers no window when the account has none to report', async () => {
    const claude = claudeThatAnswers(() => Promise.resolve({ rate_limits: null }));
    const probe = new AgentSdkUsageProbe(claude, new FixedClock(NOW), new RecordingLogger().logger);

    expect(await probe.probe(FOLDER)).toEqual([]);
  });

  it('logs and answers no window, never throwing, when the probe itself fails', async () => {
    const claude = claudeThatAnswers(() => Promise.reject(new Error('the CLI did not answer')));
    const logger = new RecordingLogger();
    const probe = new AgentSdkUsageProbe(claude, new FixedClock(NOW), logger.logger);

    await expect(probe.probe(FOLDER)).resolves.toEqual([]);
    expect(logger.withOp('engine.usageProbe')).toHaveLength(1);
    expect(logger.withOp('engine.usageProbe')[0]?.['level']).toBe('warn');
  });
});

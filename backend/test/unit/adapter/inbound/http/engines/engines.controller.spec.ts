import { describe, expect, it } from 'vitest';

import { EnginesController } from '@adapter/inbound/http/engines/engines.controller';
import { EngineRegistry } from '@application/session';
import { StubEngine } from '../../../../../support/fakes/stub-engine';

describe('GET /engines — plan 28, B-12', () => {
  it('lists the engines enabled, the default first, with what each can do, spawning nothing', async () => {
    const claude = new StubEngine('claude', '2.1.277');
    const answer = await new EnginesController(
      new EngineRegistry([claude, new StubEngine('test-engine')], 'claude'),
    ).list();

    expect(answer.defaultEngine).toBe('claude');
    expect(answer.engines.map((each) => [each.id, each.displayName, each.state])).toEqual([
      ['claude', 'Stub', 'available'],
      ['test-engine', 'Stub', 'available'],
    ]);
    expect(answer.engines[0]).toMatchObject({ version: '2.1.277', reason: null });
    expect(answer.engines[0]?.capabilities.fork).toBe('atMessage');
    expect(claude.starts).toEqual([]);
  });
});

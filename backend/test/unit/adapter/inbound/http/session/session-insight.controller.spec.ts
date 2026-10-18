import { describe, expect, it } from 'vitest';
import { isContextUsePayload } from '@remote-claude/contracts';

import {
  SessionInsightController,
  toContextUseDto,
} from '@adapter/inbound/http/session/session-insight.controller';
import type { InspectSessionUseCase } from '@application/session';
import { UserId } from '@domain/auth';
import type { ContextUse } from '@domain/session';

const USE: ContextUse = {
  model: 'claude-opus-5',
  totalTokens: 1_234,
  maxTokens: 200_000,
  percentage: 12.5,
  categories: [
    {
      id: 'free',
      messageKey: 'sessions.context.free',
      name: 'Free space',
      tokens: 190_000,
      kind: 'free',
    },
    { id: 'skills', messageKey: null, name: 'Skills', tokens: 34, kind: 'used' },
  ],
};

describe('the use of the context window, on the wire — plan 28, B-24', () => {
  it('sends a canonical category by its key, and any other by the engine words — S-71', () => {
    const dto = toContextUseDto(USE);

    expect(dto.categories).toEqual([
      { id: 'free', messageKey: 'sessions.context.free', tokens: 190_000, kind: 'free' },
      { id: 'skills', text: 'Skills', tokens: 34, kind: 'used' },
    ]);
    expect(dto.categories[0]).not.toHaveProperty('text');
    expect(dto.categories[1]).not.toHaveProperty('messageKey');
    expect(isContextUsePayload(dto)).toBe(true);
  });

  it.each([
    [12.5, 13],
    [12.49, 12],
    [0, 0],
    [99.5, 100],
    [100, 100],
  ])('rounds a percentage of %s to the whole %s — S-71', (percentage, whole) => {
    expect(toContextUseDto({ ...USE, percentage }).percentage).toBe(whole);
  });

  it('keeps the model and the totals as the engine measured them, with no categories at all', () => {
    expect(toContextUseDto({ ...USE, categories: [] })).toEqual({
      model: 'claude-opus-5',
      totalTokens: 1_234,
      maxTokens: 200_000,
      percentage: 13,
      categories: [],
    });
  });

  it('answers the route with the payload of the use the session measured', async () => {
    const owner = UserId.create('auth|owner');
    const asked: unknown[] = [];
    const controller = new SessionInsightController({
      contextOf: (sessionId: string, userId: UserId) => {
        asked.push([sessionId, userId.value]);
        return Promise.resolve(USE);
      },
    } as unknown as InspectSessionUseCase);

    expect(await controller.context('01J0ABCDEFGHJKMNPQRSTVWXYZ', owner)).toEqual(
      toContextUseDto(USE),
    );
    expect(asked).toEqual([['01J0ABCDEFGHJKMNPQRSTVWXYZ', 'auth|owner']]);
  });
});

import { describe, expect, it } from 'vitest';

import { toLiveSessionListDto } from '@adapter/inbound/http/session/live-sessions.dto';
import { aConversation, aSession } from '../../../../../support/builders/session.builder';

const SOURCE = '0f0e0d0c-0b0a-4908-8706-050403020100';

describe('the live sessions of a folder, on the wire — plan 28, B-12', () => {
  it('names the conversation by its engine', () => {
    const [row] = toLiveSessionListDto([
      { session: aSession(), conversation: aConversation(), pendingPermissions: 0 },
    ]).sessions;

    expect(row).toMatchObject({
      conversation: { engine: 'claude', id: expect.any(String) },
      resumedFromConversation: null,
    });
  });

  it('says what a resumed session continues', () => {
    const [row] = toLiveSessionListDto([
      {
        session: aSession(),
        conversation: aConversation(undefined, SOURCE),
        pendingPermissions: 2,
      },
    ]).sessions;

    expect(row).toMatchObject({
      resumedFromConversation: { engine: 'claude', id: SOURCE },
      pendingPermissions: 2,
    });
  });
});

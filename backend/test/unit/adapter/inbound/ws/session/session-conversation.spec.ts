import { describe, expect, it } from 'vitest';

import { conversationFields } from '@adapter/inbound/ws/session/session-conversation';
import { aConversation, CONVERSATION_ID } from '../../../../../support/builders/session.builder';

const SOURCE = '0f0e0d0c-0b0a-4908-8706-050403020100';

describe('conversationFields — plan 04, B-07/B-11', () => {
  it('carries nothing for a stream that is not a conversation, not even a `null`', () => {
    // The contract declares both fields strings: a `null` on the wire would be a lie of type.
    expect(conversationFields(null)).toEqual({});
  });

  it('names a fresh conversation, and says it continues nothing by leaving the field out', () => {
    expect(conversationFields(aConversation())).toEqual({ claudeSessionId: CONVERSATION_ID });
  });

  it('names what a resumed one continues', () => {
    expect(conversationFields(aConversation(CONVERSATION_ID, SOURCE))).toEqual({
      claudeSessionId: CONVERSATION_ID,
      resumedFrom: SOURCE,
    });
  });
});

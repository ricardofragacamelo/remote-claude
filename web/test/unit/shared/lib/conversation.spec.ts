import { describe, expect, it } from 'vitest';

import {
  conversationKey,
  equalConversations,
  parseConversationKey,
  readConversation,
  sameConversation,
} from '@/shared/lib/conversation';

const REF = { engine: 'claude', id: '6b41b192-a41b-46c2-b8d7-5098d8c825be' };

describe('the conversation, as `{ engine, id }` — plan 28, B-13', () => {
  it('keys a conversation by its engine and its id, and reads the key back', () => {
    expect(conversationKey(REF)).toBe('claude:6b41b192-a41b-46c2-b8d7-5098d8c825be');
    expect(parseConversationKey(conversationKey(REF))).toEqual(REF);
  });

  it('splits a key at its first colon: an id may hold one, an engine never does', () => {
    expect(parseConversationKey('other:a:b')).toEqual({ engine: 'other', id: 'a:b' });
  });

  it.each([
    ['an id alone', '6b41b192-a41b-46c2-b8d7-5098d8c825be'],
    ['no engine', ':abc'],
    ['no id', 'claude:'],
    ['nothing', ''],
  ])('reads %s as no conversation', (_case, key) => {
    expect(parseConversationKey(key)).toBeNull();
  });

  it('tells the same conversation by both fields, and `null` as none', () => {
    expect(sameConversation(REF, { ...REF })).toBe(true);
    expect(sameConversation(REF, { engine: 'other', id: REF.id })).toBe(false);
    expect(sameConversation(REF, { engine: REF.engine, id: 'another' })).toBe(false);
    expect(sameConversation(REF, null)).toBe(false);
    expect(sameConversation(null, REF)).toBe(false);
    expect(sameConversation(null, null)).toBe(false);
  });

  it('tells equal references, two `null` included', () => {
    expect(equalConversations(null, null)).toBe(true);
    expect(equalConversations(REF, { ...REF })).toBe(true);
    expect(equalConversations(REF, null)).toBe(false);
  });

  it('reads a conversation field of a payload, with only its two fields', () => {
    expect(readConversation({ conversation: { ...REF, extra: 1 } }, 'conversation')).toEqual(REF);
  });

  it.each([
    ['absent', {}],
    ['the id alone', { conversation: REF.id }],
    ['without an engine', { conversation: { id: REF.id } }],
    ['with an empty engine', { conversation: { engine: '', id: REF.id } }],
    ['with an empty id', { conversation: { engine: 'claude', id: '' } }],
    ['with an engine too long', { conversation: { engine: 'e'.repeat(33), id: REF.id } }],
  ])('reads a field %s as none', (_case, payload) => {
    expect(readConversation(payload, 'conversation')).toBeNull();
  });
});

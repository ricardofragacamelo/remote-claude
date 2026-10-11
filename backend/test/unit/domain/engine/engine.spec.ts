import { describe, expect, it } from 'vitest';

import {
  AgentTimeoutError,
  AgentUnavailableError,
  ConversationRef,
  EngineCapabilityUnavailableError,
  EngineId,
  hasCapability,
  InvalidConversationRefError,
  isKnownToolKind,
  KNOWN_TOOL_KINDS,
  requireCapability,
} from '@domain/engine';
import type { EngineCapabilities } from '@domain/engine';

const NONE: EngineCapabilities = {
  resume: false,
  fork: 'none',
  history: false,
  images: false,
  promptWhileBusy: false,
  questions: false,
  planApproval: false,
  taskList: false,
  subagents: false,
  thinking: false,
  slashCommands: false,
  modelSwitch: false,
  effortLevels: [],
  contextUse: false,
  mcp: false,
  compaction: false,
  cost: 'none',
  permissionModes: [],
};

describe('EngineId — plan 28, B-08', () => {
  it.each([['claude'], ['codex'], ['test-engine'], ['a'.repeat(32)]])('takes %s', (name) => {
    expect(EngineId.create(name).value).toBe(name);
  });

  it.each([[''], ['Claude'], ['1engine'], ['a'.repeat(33)], ['two words'], ['../x']])(
    'refuses %j, as INVALID_INPUT',
    (name) => {
      expect(() => EngineId.create(name)).toThrow(InvalidConversationRefError);
      expect(EngineId.parse(name)).toBeNull();
    },
  );

  it('is equal by value', () => {
    expect(EngineId.create('claude').equals(EngineId.create('claude'))).toBe(true);
    expect(EngineId.create('claude').equals(EngineId.create('codex'))).toBe(false);
    expect(String(EngineId.create('claude'))).toBe('claude');
  });
});

describe('ConversationRef — S-25', () => {
  it('is an engine and an id, printed and keyed as `engine:id`', () => {
    const ref = ConversationRef.create('claude', 'abc');

    expect(ref.engine.value).toBe('claude');
    expect(ref.id).toBe('abc');
    expect(ref.key).toBe('claude:abc');
    expect(String(ref)).toBe('claude:abc');
  });

  it('is equal only with the same engine and the same id', () => {
    const ref = ConversationRef.create('claude', 'abc');

    expect(ref.equals(ConversationRef.create('claude', 'abc'))).toBe(true);
    expect(ref.equals(ConversationRef.create('codex', 'abc'))).toBe(false);
    expect(ref.equals(ConversationRef.create('claude', 'abd'))).toBe(false);
  });

  it.each([
    ['an engine that is not the form of one', 'Claude', 'abc'],
    ['an empty id', 'claude', ''],
    ['an id with whitespace', 'claude', 'a b'],
    ['an id too long', 'claude', 'x'.repeat(257)],
  ])('refuses %s, as INVALID_INPUT with the engine', (_case, engine, id) => {
    expect(ConversationRef.parse(engine, id)).toBeNull();
    try {
      ConversationRef.create(engine, id);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidConversationRefError);
      expect((error as InvalidConversationRefError).code).toBe('INVALID_INPUT');
      expect((error as InvalidConversationRefError).messageKey).toBe(
        'transcript.error.invalidSessionId',
      );
      expect((error as InvalidConversationRefError).params).toEqual({ engine, sessionId: id });
    }
  });

  it('takes an id of 256 characters, the longest', () => {
    expect(ConversationRef.create('claude', 'x'.repeat(256)).id).toHaveLength(256);
  });
});

describe('the capabilities — S-27', () => {
  it('reads a flag, a fork, a list and a unit', () => {
    const some: EngineCapabilities = {
      ...NONE,
      resume: true,
      fork: 'whole',
      effortLevels: ['low'],
      cost: 'usd',
    };

    expect(hasCapability(some, 'resume')).toBe(true);
    expect(hasCapability(some, 'fork')).toBe(true);
    expect(hasCapability(some, 'effortLevels')).toBe(true);
    expect(hasCapability(some, 'cost')).toBe(true);
    expect(hasCapability(NONE, 'resume')).toBe(false);
    expect(hasCapability(NONE, 'fork')).toBe(false);
    expect(hasCapability(NONE, 'effortLevels')).toBe(false);
    expect(hasCapability(NONE, 'cost')).toBe(false);
  });

  it('refuses what the engine does not have as ENGINE_CAPABILITY_UNAVAILABLE, never undefined', () => {
    try {
      requireCapability('test', NONE, 'contextUse');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EngineCapabilityUnavailableError);
      expect((error as EngineCapabilityUnavailableError).code).toBe(
        'ENGINE_CAPABILITY_UNAVAILABLE',
      );
      expect((error as EngineCapabilityUnavailableError).messageKey).toBe(
        'engine.error.capabilityUnavailable',
      );
      expect((error as EngineCapabilityUnavailableError).params).toEqual({
        engine: 'test',
        capability: 'contextUse',
      });
    }
    expect(() => {
      requireCapability('test', { ...NONE, contextUse: true }, 'contextUse');
    }).not.toThrow();
  });
});

describe('the neutral errors of an agent — S-26', () => {
  it('says the agent fell over as AGENT_UNAVAILABLE, with the engine', () => {
    const error = new AgentUnavailableError('claude', 'session-1');

    expect(error.code).toBe('AGENT_UNAVAILABLE');
    expect(error.messageKey).toBe('session.error.agentUnavailable');
    expect(error.params).toEqual({ engine: 'claude', sessionId: 'session-1' });
  });

  it('says the agent did not answer as AGENT_TIMEOUT, with the engine', () => {
    const error = new AgentTimeoutError('claude', 'session-1', 'list its models', 5_000);

    expect(error.code).toBe('AGENT_TIMEOUT');
    expect(error.messageKey).toBe('session.error.agentTimeout');
    expect(error.params).toEqual({
      engine: 'claude',
      operation: 'list its models',
      timeoutMs: 5_000,
    });
  });

  it('takes the key of the history for a read of it', () => {
    expect(
      new AgentUnavailableError('claude', 'x', 'transcript.error.agentUnavailable').messageKey,
    ).toBe('transcript.error.agentUnavailable');
  });
});

describe('the kinds of a tool', () => {
  it('knows the canonical ones, and treats any other as open', () => {
    expect(KNOWN_TOOL_KINDS).toContain('file.edit');
    expect(KNOWN_TOOL_KINDS).toContain('other');
    expect(isKnownToolKind('shell')).toBe(true);
    expect(isKnownToolKind('Bash')).toBe(false);
  });
});

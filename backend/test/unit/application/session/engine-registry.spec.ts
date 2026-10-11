import { describe, expect, it } from 'vitest';

import {
  controlOf,
  EngineRegistry,
  liveControl,
  SECURITY_CLAUSES,
  SECURITY_UNMET_REASON,
} from '@application/session';
import {
  AgentUnavailableError,
  EngineCapabilityUnavailableError,
  InvalidConversationRefError,
} from '@domain/engine';
import {
  aConversation,
  aSession,
  aStart,
  RecordingHandle,
} from '../../../support/builders/session.builder';
import { StubEngine } from '../../../support/fakes/stub-engine';

const UUID = '6b41b192-a41b-46c2-b8d7-5098d8c825be';

describe('EngineRegistry — plan 28, B-09', () => {
  it('resolves an engine by its name, and the default when none is named', () => {
    const claude = new StubEngine('claude');
    const other = new StubEngine('test-engine');
    const registry = new EngineRegistry([claude, other], 'test-engine');

    expect(registry.require('claude')).toBe(claude);
    expect(registry.require(other.engine)).toBe(other);
    expect(registry.default).toBe(other);
    expect(registry.all).toEqual([claude, other]);
    expect(registry.has('claude')).toBe(true);
    expect(registry.has('codex')).toBe(false);
  });

  it('refuses an engine that is not enabled as INVALID_INPUT — S-25', () => {
    const registry = new EngineRegistry([new StubEngine()], 'claude');

    expect(() => registry.require('codex')).toThrow(InvalidConversationRefError);
  });

  it('names a conversation by the engine’s own rule, and refuses an id it never hands out — S-25', () => {
    const registry = new EngineRegistry([new StubEngine()], 'claude');

    expect(registry.conversation('claude', UUID).key).toBe(`claude:${UUID}`);
    expect(() => registry.conversation('claude', 'not-a-uuid')).toThrow(
      InvalidConversationRefError,
    );
    expect(() => registry.conversation('codex', UUID)).toThrow(InvalidConversationRefError);
  });

  it('refuses to be built with a default that is not enabled', () => {
    expect(() => new EngineRegistry([new StubEngine()], 'codex')).toThrow('is not one of');
  });

  it('describes every engine at once, spawning nothing — S-30', async () => {
    const claude = new StubEngine('claude');
    const other = new StubEngine('test-engine');
    const registry = new EngineRegistry([claude, other], 'claude');

    const [first, second] = await Promise.all([registry.describeAll(), registry.describeAll()]);

    expect(first.map((each) => each.engine.value)).toEqual(['claude', 'test-engine']);
    expect(second).toEqual(first);
    expect(claude.starts).toEqual([]);
    expect(claude.describedTimes).toBe(2);
  });
});

describe('the security assertion of each engine — plan 28, B-35, S-102', () => {
  /** An engine whose adapter could not prove two clauses of the contract. */
  const unsafe = (): StubEngine => {
    const engine = new StubEngine('test-engine', '3.0.0');
    engine.security = {
      configFiles: [],
      assert: () => ({ holds: false, unmet: ['noSelfApproval', 'configSensitive'] }),
    };
    return engine;
  };

  it('lets an engine whose assertion holds through as it is', () => {
    const claude = new StubEngine('claude');
    const registry = new EngineRegistry([claude], 'claude');

    expect(registry.require('claude')).toBe(claude);
    expect(registry.refused).toEqual([]);
  });

  it('keeps an engine whose assertion fails, unavailable with the reason, and the others start', async () => {
    const claude = new StubEngine('claude');
    const registry = new EngineRegistry([claude, unsafe()], 'claude');

    expect(registry.refused).toEqual([
      { engine: 'test-engine', unmet: ['noSelfApproval', 'configSensitive'] },
    ]);
    const [first, second] = await registry.describeAll();
    expect(first).toMatchObject({ state: 'available', reason: null });
    expect(second).toMatchObject({
      state: 'unavailable',
      reason: SECURITY_UNMET_REASON,
      version: '3.0.0',
    });
    expect(registry.require('claude')).toBe(claude);
  });

  it('opens no session on it — refused before a conversation is minted, and at the start', async () => {
    const engine = unsafe();
    const refused = new EngineRegistry([engine], 'test-engine').require('test-engine');

    expect(() => refused.newConversation()).toThrow(AgentUnavailableError);
    await expect(refused.start(aStart())).rejects.toThrow(AgentUnavailableError);
    expect(engine.starts).toEqual([]);
  });

  it('still names its conversations, and says what it is — nothing is spawned for either', () => {
    const engine = unsafe();
    const refused = new EngineRegistry([engine], 'test-engine').require('test-engine');

    expect(refused.conversationOf(UUID)?.key).toBe(`test-engine:${UUID}`);
    expect(refused.engine).toBe(engine.engine);
    expect(refused.capabilities).toBe(engine.capabilities);
    expect(refused.security).toBe(engine.security);
  });

  it('counts an assertion that throws as every clause unmet — never let through on an error', () => {
    const engine = new StubEngine('claude');
    engine.security = {
      configFiles: [],
      assert: () => {
        throw new Error('the probe broke');
      },
    };

    expect(new EngineRegistry([engine], 'claude').refused).toEqual([
      { engine: 'claude', unmet: SECURITY_CLAUSES },
    ]);
  });

  it('boots with the default engine refused, rather than refusing the boot', async () => {
    const registry = new EngineRegistry([unsafe()], 'test-engine');

    expect((await registry.default.describe()).state).toBe('unavailable');
  });
});

describe('the control of a session — S-27', () => {
  it('hands back the member the engine has, bound to the session', async () => {
    const handle = new RecordingHandle();
    handle.offered = [];

    await expect(controlOf(new StubEngine().engine, handle, 'supportedModels')()).resolves.toEqual(
      [],
    );
  });

  it('refuses a member the engine does not have as ENGINE_CAPABILITY_UNAVAILABLE, never undefined', () => {
    const handle = new RecordingHandle();
    Object.defineProperty(handle, 'control', { value: {} });

    expect(() => controlOf(new StubEngine('test-engine').engine, handle, 'setModel')).toThrow(
      EngineCapabilityUnavailableError,
    );
    try {
      liveControl({ session: aSession(), handle, conversation: aConversation() }, 'contextUse');
    } catch (error) {
      expect((error as EngineCapabilityUnavailableError).params).toEqual({
        engine: 'claude',
        capability: 'contextUse',
      });
    }
  });
});

import { describe, expect, it } from 'vitest';
import type { Response } from 'express';

import { TranscriptController } from '@adapter/inbound/http/transcript/transcript.controller';
import { TranscriptStoreRegistry } from '@application/transcript';
import type {
  ListTranscriptsUseCase,
  ReadPromptImageUseCase,
  ReadToolResultUseCase,
  ReadTranscriptUseCase,
} from '@application/transcript';
import { UserId } from '@domain/auth';
import type { ConversationRef } from '@domain/engine';
import { InvalidConversationRefError } from '@domain/engine';
import { TranscriptNotFoundError } from '@domain/transcript';
import {
  aTranscriptSession,
  conversationId,
} from '../../../../../support/builders/transcript.builder';
import { InMemoryTranscriptStore } from '../../../../../support/fakes/in-memory-transcript.store';

const user = UserId.create('auth|owner');
const ID = conversationId(1);

/** The controller over use cases that record the conversation each was asked about. */
function aController() {
  const asked: string[] = [];
  const record = (sessionId: ConversationRef) => asked.push(sessionId.key);
  const listed = {
    ...aTranscriptSession({ id: 1 }),
    origin: 'ours' as const,
    activity: { activity: 'idle', liveSessionId: null, writtenAgoSeconds: 1 },
  };
  const page = { session: listed, page: { items: [], next: null }, lastMessageId: null };
  const reading = {
    execute: ({ sessionId }: { sessionId: ConversationRef }) => {
      record(sessionId);
      return Promise.resolve(page);
    },
    subagent: ({ sessionId }: { sessionId: ConversationRef }) => {
      record(sessionId);
      return Promise.resolve({ items: [], next: null });
    },
  } as unknown as ReadTranscriptUseCase;
  const results = {
    execute: ({ sessionId }: { sessionId: ConversationRef }) => {
      record(sessionId);
      return Promise.resolve({ text: 'out', truncated: false, bytes: 3 });
    },
  } as unknown as ReadToolResultUseCase;
  const images = {
    execute: ({ sessionId }: { sessionId: ConversationRef }) => {
      record(sessionId);
      return Promise.resolve({
        mediaType: 'image/png',
        data: Buffer.from('png').toString('base64'),
      });
    },
  } as unknown as ReadPromptImageUseCase;
  const listing = {
    execute: () =>
      Promise.resolve({ items: [listed], next: { lastModified: 5, id: `claude:${ID}` } }),
  } as unknown as ListTranscriptsUseCase;
  const controller = new TranscriptController(
    listing,
    reading,
    results,
    images,
    new TranscriptStoreRegistry([new InMemoryTranscriptStore()], 'claude'),
  );
  return { controller, asked };
}

/** A response that keeps what it was told. */
function aResponse() {
  const headers = new Map<string, string>();
  const response = {
    status: () => response,
    setHeader: (name: string, value: string) => headers.set(name, value),
    end: () => undefined,
  };
  return { response: response as unknown as Response, headers };
}

describe('the routes of the history — plan 28, B-12', () => {
  it('reads every resource of a conversation by its engine and id', async () => {
    const { controller, asked } = aController();
    const query = {};

    await controller.read('claude', ID, query, user);
    await controller.readSubagent('claude', ID, 'toolu_1', query, user);
    await controller.readToolResult('claude', ID, 'toolu_1', user);
    await controller.readImage('claude', ID, `${ID}:0`, user, aResponse().response);

    expect(asked).toEqual(Array.from({ length: 4 }, () => `claude:${ID}`));
  });

  it('forwards the folder of the query as the use case\'s hint of the conversation — S-163', async () => {
    const hints: (string | null | undefined)[] = [];
    const page = {
      session: {
        ...aTranscriptSession({ id: 1 }),
        origin: 'ours' as const,
        activity: { activity: 'idle', liveSessionId: null, writtenAgoSeconds: 1 },
      },
      page: { items: [], next: null },
      lastMessageId: null,
    };
    const reading = {
      execute: ({ workspaceHint }: { workspaceHint?: string | null }) => {
        hints.push(workspaceHint);
        return Promise.resolve(page);
      },
      subagent: ({ workspaceHint }: { workspaceHint?: string | null }) => {
        hints.push(workspaceHint);
        return Promise.resolve({ items: [], next: null });
      },
    } as unknown as ReadTranscriptUseCase;
    const controller = new TranscriptController(
      {} as ListTranscriptsUseCase,
      reading,
      {} as ReadToolResultUseCase,
      {} as ReadPromptImageUseCase,
      new TranscriptStoreRegistry([new InMemoryTranscriptStore()], 'claude'),
    );

    await controller.read('claude', ID, { workspacePath: '/home/ricardocamelo/app' }, user);
    await controller.readSubagent(
      'claude',
      ID,
      'toolu_1',
      { workspacePath: '/home/ricardocamelo/app' },
      user,
    );

    expect(hints).toEqual(['/home/ricardocamelo/app', '/home/ricardocamelo/app']);
  });

  it('lists the conversations of a folder, with the cursor of the next page', async () => {
    const { controller } = aController();

    const listed = await controller.list(
      {
        workspacePath: '/srv/projects/app',
        cursor: `5.claude:${ID}`,
        limit: 1,
        includeSubfolders: 'true',
      },
      user,
    );

    expect(listed.nextCursor).toBe(`5.claude:${ID}`);
    expect(listed.sessions[0]?.conversation).toEqual({ engine: 'claude', id: ID });
  });

  it('pages from the cursor asked, as many as asked', async () => {
    const { controller, asked } = aController();

    await controller.read('claude', ID, { cursor: 'm1', limit: 2 }, user);
    await controller.readSubagent('claude', ID, 'toolu_1', { cursor: 'm1', limit: 2 }, user);

    expect(asked).toHaveLength(2);
  });

  it('serves an image only as what its type says', async () => {
    const { controller } = aController();
    const { response, headers } = aResponse();

    await controller.readImage('claude', ID, `${ID}:0`, user, response);

    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Content-Type')).toBe('image/png');
  });

  it('answers a conversation of an engine that is not enabled as one that does not exist', () => {
    const { controller } = aController();

    expect(() => controller.read('codex', ID, {}, user)).toThrow(TranscriptNotFoundError);
  });

  it('refuses an id the engine never hands out', () => {
    const { controller } = aController();

    expect(() => controller.read('claude', 'not-a-uuid', {}, user)).toThrow(
      InvalidConversationRefError,
    );
  });
});

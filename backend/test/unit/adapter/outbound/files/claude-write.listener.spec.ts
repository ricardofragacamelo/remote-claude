import { describe, expect, it } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { ClaudeWrites } from '@application/files';
import { SESSION_FILE_STATE_RECORDED } from '@application/shared';
import type { SessionFileStateRecorded } from '@application/shared';
import { ClaudeWriteListener } from '@adapter/outbound/files/claude-write.listener';
import { EmitterSessionFileEvents } from '@adapter/outbound/session/emitter-session-file.events';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

const write: SessionFileStateRecorded = {
  path: '/srv/app/a.ts',
  hash: 'h1',
  at: new Date('2026-09-30T12:00:00.000Z'),
};

describe("Claude's writes, from the session to the files — S-126", () => {
  it('reach `files` on the bus, and `files` keeps them', () => {
    const bus = new EventEmitter2();
    const writes = new ClaudeWrites();
    const log = new RecordingLogger();
    const listener = new ClaudeWriteListener(writes, log.logger);
    bus.on(SESSION_FILE_STATE_RECORDED, (event: SessionFileStateRecorded) => {
      listener.remember(event);
    });

    new EmitterSessionFileEvents(bus, log.logger).fileStateRecorded(write);

    expect(writes.wrote(write.path, write.hash, write.at)).toBe(true);
    expect(log.withOp('files.claudeWrite')[0]).toMatchObject({ path: write.path });
  });

  it('never let a listener that throws reach the hook that published', () => {
    const bus = new EventEmitter2();
    const log = new RecordingLogger();
    bus.on(SESSION_FILE_STATE_RECORDED, () => {
      throw new Error('a listener of its own problems');
    });

    expect(() => {
      new EmitterSessionFileEvents(bus, log.logger).fileStateRecorded(write);
    }).not.toThrow();
    expect(log.withOp('session.fileStateRecorded').at(-1)).toMatchObject({ level: 'error' });
  });
});

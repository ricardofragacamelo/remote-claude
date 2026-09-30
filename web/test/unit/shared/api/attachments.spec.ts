import { describe, expect, it, vi } from 'vitest';

import { createAttachments } from '@/shared/api/attachments';
import type { SessionSubscriber } from '@/shared/api/ws-client';

function aClient() {
  const detach = vi.fn();
  const attach = vi.fn<(sessionId: string, subscriber: SessionSubscriber) => () => void>(
    () => detach,
  );
  return { attach, detach };
}

const subscriber = (): SessionSubscriber => ({
  onEvent: () => undefined,
  onGap: () => undefined,
  lastSeq: () => 0,
});

/** A session held by a tab and by its screen is attached once — plan 06, S-181. */
describe('attachments held by several owners', () => {
  it('attaches for the first owner, and only counts the next', () => {
    const client = aClient();
    const attachments = createAttachments(client);
    const build = vi.fn(subscriber);

    attachments.retain('live-session', 'S1', build);
    attachments.retain('live-session', 'S1', build);

    expect(client.attach).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('lets go when the last owner does — never before', () => {
    const client = aClient();
    const attachments = createAttachments(client);
    const tab = attachments.retain('live-session', 'S1', subscriber);
    const screen = attachments.retain('live-session', 'S1', subscriber);

    screen();
    expect(client.detach).not.toHaveBeenCalled();

    tab();
    expect(client.detach).toHaveBeenCalledTimes(1);
  });

  it('releases once, however many times a cleanup runs', () => {
    const client = aClient();
    const attachments = createAttachments(client);
    const tab = attachments.retain('live-session', 'S1', subscriber);
    const screen = attachments.retain('live-session', 'S1', subscriber);

    screen();
    screen();

    expect(client.detach).not.toHaveBeenCalled();
    tab();
    tab();
    expect(client.detach).toHaveBeenCalledTimes(1);
  });

  it('keeps the streams of one session apart — the conversation and the questions', () => {
    const client = aClient();
    const attachments = createAttachments(client);

    attachments.retain('live-session', 'S1', subscriber);
    attachments.retain('permission', 'S1', subscriber);
    attachments.retain('live-session', 'S2', subscriber);

    expect(client.attach).toHaveBeenCalledTimes(3);
  });

  it('attaches again for an owner who comes after everybody left', () => {
    const client = aClient();
    const attachments = createAttachments(client);

    attachments.retain('live-session', 'S1', subscriber)();
    attachments.retain('live-session', 'S1', subscriber);

    expect(client.attach).toHaveBeenCalledTimes(2);
  });
});

import { describe, expect, it } from 'vitest';

import { statusFor } from '@domain/session';

describe('statusFor', () => {
  it.each([
    ['session.started', 'idle'],
    ['message.delta', 'thinking'],
    ['message.completed', 'thinking'],
    ['tool.started', 'running'],
    ['tool.progress', 'running'],
    ['tool.completed', 'running'],
    ['permission.requested', 'waitingPermission'],
    ['permission.resolved', 'running'],
    ['turn.completed', 'idle'],
    ['session.closed', 'closed'],
  ])('reads %s as %s', (event, status) => {
    expect(statusFor(event)).toBe(status);
  });

  it('says nothing about an event that implies nothing', () => {
    // Most of the stream is content. A default of "unknown" would make the UI flicker on every
    // fragment of text.
    expect(statusFor('session.statusChanged')).toBeNull();
    expect(statusFor('diag.pong')).toBeNull();
  });

  it('keeps `waitingPermission` distinct from `running`', () => {
    // The one the UI cannot afford to confuse: a blocked loop looks identical to a busy one, and
    // a spinner for something that will never finish on its own is the worst of the two.
    expect(statusFor('permission.requested')).not.toBe(statusFor('tool.started'));
  });
});

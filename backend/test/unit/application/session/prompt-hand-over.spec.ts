import { describe, expect, it } from 'vitest';

import { handOverPrompt } from '@application/session/prompt-hand-over';
import type { LiveSession } from '@application/session/session-registry';
import { RecordingBroadcaster } from '../../../support/fakes/recording-broadcaster';

/** A live session whose handle files every prompt under one known id. */
function aLiveSession(): LiveSession {
  return {
    session: { id: 'ses_1' },
    handle: { prompt: () => 'prompt-uuid' },
  } as unknown as LiveSession;
}

describe('the prompt said to everybody — plan 22, B-06, B-09', () => {
  it('names each block as the CLI files it, and says an image by its type and size — S-18', () => {
    const broadcaster = new RecordingBroadcaster();
    const data = Buffer.from('not really a png').toString('base64');

    handOverPrompt(aLiveSession(), broadcaster, {
      text: 'composed',
      extras: { typed: 'what is this?', images: [{ mediaType: 'image/png', data }], context: [] },
      promptedBy: 'web',
    });

    const payload = broadcaster.events[0]?.event.payload;
    expect(payload?.['content']).toEqual([
      { type: 'text', blockId: 'prompt-uuid:0', text: 'what is this?' },
      { type: 'image', blockId: 'prompt-uuid:1', mediaType: 'image/png', size: 16 },
    ]);
    expect(JSON.stringify(payload)).not.toContain(data);
  });
});

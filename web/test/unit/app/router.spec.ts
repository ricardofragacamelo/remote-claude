import { describe, expect, it } from 'vitest';

import { router } from '@/app/router';
import { CALLBACK_PATH } from '@/features/auth';

describe('the routes', () => {
  it('serves the screen at the root', () => {
    expect(Object.keys(router.routesById)).toContain('/');
  });

  it('serves the provider’s callback, at the path the login publishes', () => {
    expect(Object.keys(router.routesById)).toContain(CALLBACK_PATH);
  });

  it('carries the session in the path, so the link reproduces the screen', () => {
    // The test the architecture states: pasting the link on another device brings up the same
    // screen. A session held in a store would fail it.
    expect(Object.keys(router.routesById)).toContain('/sessions/$sessionId');
  });
});

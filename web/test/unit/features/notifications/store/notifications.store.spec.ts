import { afterEach, describe, expect, it } from 'vitest';

import { useNotifications } from '@/features/notifications';
import { initialDoNotDisturb } from '@/features/notifications/store/notifications.store';
import { VISITOR_PREFIX } from '@/shared/lib/visitor-storage';

afterEach(() => {
  useNotifications.setState({ doNotDisturb: false, centerOpen: false });
});

describe('"do not disturb" — plan 06, S-131', () => {
  it('is off for somebody who never turned it on', () => {
    expect(initialDoNotDisturb()).toBe(false);
  });

  it('is remembered by this browser', () => {
    useNotifications.getState().setDoNotDisturb(true);

    expect(localStorage.getItem(`${VISITOR_PREFIX}notifications.doNotDisturb`)).toBe('true');
    expect(initialDoNotDisturb()).toBe(true);
  });

  it('is off when the storage throws, or holds something else', () => {
    expect(
      initialDoNotDisturb(() => {
        throw new Error('blocked');
      }),
    ).toBe(false);
    localStorage.setItem(`${VISITOR_PREFIX}notifications.doNotDisturb`, '"yes"');
    expect(initialDoNotDisturb()).toBe(false);
  });
});

describe('the centre', () => {
  it('opens, closes and toggles', () => {
    const state = useNotifications.getState();

    state.setCenterOpen(true);
    expect(useNotifications.getState().centerOpen).toBe(true);
    state.toggleCenter();
    expect(useNotifications.getState().centerOpen).toBe(false);
  });
});

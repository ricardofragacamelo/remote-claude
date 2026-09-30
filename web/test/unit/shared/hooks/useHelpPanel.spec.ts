import { describe, expect, it } from 'vitest';

import { initialHelpOpen, useHelpPanel } from '@/shared/hooks/useHelpPanel';
import { VISITOR_PREFIX } from '@/shared/lib/visitor-storage';
import type { VisitorStorage } from '@/shared/lib/visitor-storage';

function saved(value: string | null): () => VisitorStorage {
  return () => ({ getItem: () => value, setItem: () => undefined });
}

describe('whether the help starts open — plan 06, S-95', () => {
  it('is closed for somebody who never opened it', () => {
    expect(initialHelpOpen(saved(null))).toBe(false);
  });

  it('is as it was left in this browser', () => {
    expect(initialHelpOpen(saved('true'))).toBe(true);
    expect(initialHelpOpen(saved('false'))).toBe(false);
  });

  it('is closed when what was kept is not a yes or a no, or cannot be read', () => {
    expect(initialHelpOpen(saved('"open"'))).toBe(false);
    expect(
      initialHelpOpen(() => {
        throw new DOMException('blocked', 'SecurityError');
      }),
    ).toBe(false);
  });
});

describe('the help panel', () => {
  it('opens at a part a control asked about, and remembers that it is open', () => {
    useHelpPanel.getState().show('notRecorded');

    expect(useHelpPanel.getState()).toMatchObject({ open: true, section: 'notRecorded' });
    expect(localStorage.getItem(`${VISITOR_PREFIX}help.open`)).toBe('true');
  });

  it('opens at the top when no part is asked for', () => {
    useHelpPanel.getState().show();

    expect(useHelpPanel.getState()).toMatchObject({ open: true, section: null });
  });

  it('forgets the part once it is on screen', () => {
    useHelpPanel.getState().show('states');
    useHelpPanel.getState().shown();

    expect(useHelpPanel.getState()).toMatchObject({ open: true, section: null });
  });

  it('closes, forgetting any part it was asked for, and remembers that it is closed', () => {
    useHelpPanel.getState().show('states');
    useHelpPanel.getState().setOpen(false);

    expect(useHelpPanel.getState()).toMatchObject({ open: false, section: null });
    expect(localStorage.getItem(`${VISITOR_PREFIX}help.open`)).toBe('false');
  });

  it('opens twice as one panel — the second is the same state', () => {
    useHelpPanel.getState().setOpen(true);
    useHelpPanel.getState().setOpen(true);

    expect(useHelpPanel.getState().open).toBe(true);
  });
});

describe('the screens with a help on screen — plan 06, S-198', () => {
  it('counts each one while it is there, and letting go twice counts once', () => {
    const first = useHelpPanel.getState().attach();
    const second = useHelpPanel.getState().attach();
    expect(useHelpPanel.getState().hosts).toBe(2);

    first();
    first();
    expect(useHelpPanel.getState().hosts).toBe(1);
    second();
    expect(useHelpPanel.getState().hosts).toBe(0);
  });

  it('counts every request for the help, open or not — what the sheet of the workbench opens on', () => {
    const before = useHelpPanel.getState().requested;

    useHelpPanel.getState().show();
    useHelpPanel.getState().show('states');

    expect(useHelpPanel.getState().requested).toBe(before + 2);
  });
});

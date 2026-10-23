import { Plus } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { goCommandOf } from '@/features/commands';
import type { GoActionLike } from '@/features/commands';

function anAction(overrides: Partial<GoActionLike> = {}): GoActionLike {
  return {
    id: 'thing.add',
    labelKey: 'thing.add',
    icon: Plus,
    available: () => true,
    run: vi.fn(),
    ...overrides,
  };
}

describe('goCommandOf', () => {
  it('turns an action into a category "go" command, carrying the given labelParams', () => {
    const action = anAction();
    const command = goCommandOf(action, { engine: 'claude' });

    expect(command).toMatchObject({
      id: 'thing.add',
      labelKey: 'thing.add',
      labelParams: { engine: 'claude' },
      category: 'go',
      icon: Plus,
    });
  });

  it('reads availability and runs straight from the underlying action', () => {
    const run = vi.fn();
    const action = anAction({ available: () => false, run });
    const command = goCommandOf(action, {});

    expect(command.when?.()).toBe(false);
    command.run();
    expect(run).toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useWizardStepFocus } from '@/shared/hooks/useWizardStepFocus';

/**
 * Renders the hook with its `initialProps` typed as `string | null` from the start — so a later
 * `rerender` can pass `null` too (the dialog closing) without `Props` having been narrowed to
 * `string` alone by whatever the first render happened to pass. Returns the `focus` spy, wired to
 * the ref the hook itself created and returned — as if a `<div>` had mounted under it.
 */
function renderStep(step: string | null) {
  const focus = vi.fn();
  const rendered = renderHook(
    ({ step: current }: { step: string | null }) => useWizardStepFocus(current),
    { initialProps: { step } },
  );
  rendered.result.current.current = { focus } as unknown as HTMLElement;
  return { ...rendered, focus };
}

/**
 * Moving the focus between the steps of a two-step wizard (plan 13, B-30, S-140): `AddEditServerDialog`
 * and `AddLocalPluginDialog` share this instead of each hand-copying the same effect.
 */
describe('useWizardStepFocus — the focus of a wizard step, never stranded on a removed button', () => {
  it('never focuses on the very first render, however the step starts', () => {
    const { focus } = renderStep('form');

    expect(focus).not.toHaveBeenCalled();
  });

  it('focuses the step when it actually changes — "Next", then "Back"', () => {
    const { rerender, focus } = renderStep('form');

    rerender({ step: 'preview' });
    expect(focus).toHaveBeenCalledTimes(1);

    rerender({ step: 'form' });
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it('never focuses while re-rendered with the same step', () => {
    const { rerender, focus } = renderStep('form');

    rerender({ step: 'form' });
    rerender({ step: 'form' });

    expect(focus).not.toHaveBeenCalled();
  });

  it('never focuses when the wizard closes, and treats the next open as a first render again', () => {
    const { rerender, focus } = renderStep('form');

    rerender({ step: null });
    expect(focus).not.toHaveBeenCalled();

    rerender({ step: 'form' });
    expect(focus).not.toHaveBeenCalled();
  });

  it('returns a fresh ref, unset until something attaches to it', () => {
    const { result } = renderHook(({ step }: { step: string | null }) => useWizardStepFocus(step), {
      initialProps: { step: 'form' },
    });

    expect(result.current.current).toBeNull();
  });
});

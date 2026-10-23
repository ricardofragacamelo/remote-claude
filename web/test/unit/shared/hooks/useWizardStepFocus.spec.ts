import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { RefObject } from 'react';

import { useWizardStepFocus } from '@/shared/hooks/useWizardStepFocus';

/** A ref of a focusable element whose `focus()` the test can spy on, without a real DOM node. */
function aStepRef(): { ref: RefObject<HTMLElement | null>; focus: ReturnType<typeof vi.fn> } {
  const focus = vi.fn();
  return { ref: { current: { focus } as unknown as HTMLElement }, focus };
}

/**
 * Renders the hook with its `initialProps` typed as `string | null` from the start — so a later
 * `rerender` can pass `null` too (the dialog closing) without `Props` having been narrowed to
 * `string` alone by whatever the first render happened to pass.
 */
function renderStep(step: string | null, ref: RefObject<HTMLElement | null>) {
  return renderHook(
    ({ step: current }: { step: string | null }) => useWizardStepFocus(current, ref),
    {
      initialProps: { step },
    },
  );
}

/**
 * Moving the focus between the steps of a two-step wizard (plan 13, B-30, S-140): `AddEditServerDialog`
 * and `AddLocalPluginDialog` share this instead of each hand-copying the same effect.
 */
describe('useWizardStepFocus — the focus of a wizard step, never stranded on a removed button', () => {
  it('never focuses on the very first render, however the step starts', () => {
    const { ref, focus } = aStepRef();

    renderStep('form', ref);

    expect(focus).not.toHaveBeenCalled();
  });

  it('focuses the step when it actually changes — "Next", then "Back"', () => {
    const { ref, focus } = aStepRef();
    const { rerender } = renderStep('form', ref);

    rerender({ step: 'preview' });
    expect(focus).toHaveBeenCalledTimes(1);

    rerender({ step: 'form' });
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it('never focuses while re-rendered with the same step', () => {
    const { ref, focus } = aStepRef();
    const { rerender } = renderStep('form', ref);

    rerender({ step: 'form' });
    rerender({ step: 'form' });

    expect(focus).not.toHaveBeenCalled();
  });

  it('never focuses when the wizard closes, and treats the next open as a first render again', () => {
    const { ref, focus } = aStepRef();
    const { rerender } = renderStep('form', ref);

    rerender({ step: null });
    expect(focus).not.toHaveBeenCalled();

    rerender({ step: 'form' });
    expect(focus).not.toHaveBeenCalled();
  });
});

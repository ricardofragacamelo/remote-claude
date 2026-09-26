import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  fromLocalInput,
  toLocalInput,
  useAuditFilterDraft,
} from '@/features/audit/hooks/useAuditFilterDraft';

describe('the local date-time of a filter', () => {
  it('round-trips an instant through the input, in this browser`s zone', () => {
    const iso = '2026-09-24T12:34:00.000Z';

    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
  });

  it('shows nothing for no instant, or for one that is not an instant', () => {
    expect(toLocalInput(undefined)).toBe('');
    expect(toLocalInput('yesterday')).toBe('');
  });

  it('sends nothing for an empty input, or for one that is not a date', () => {
    expect(fromLocalInput('')).toBeUndefined();
    expect(fromLocalInput('not a date')).toBeUndefined();
  });
});

describe('the filter draft', () => {
  it('starts from the filters it was given', () => {
    const { result } = renderHook(() =>
      useAuditFilterDraft({ sessionId: 'S1', decision: 'denied' }, vi.fn()),
    );

    expect(result.current.fields).toMatchObject({
      sessionId: 'S1',
      toolName: '',
      decision: 'denied',
      from: '',
      to: '',
    });
  });

  it('applies what was typed, trimmed, and nothing that was left empty', () => {
    const apply = vi.fn();
    const { result } = renderHook(() => useAuditFilterDraft({}, apply));

    act(() => {
      result.current.set('sessionId', '  S1  ');
      result.current.set('toolName', '   ');
      result.current.set('decision', 'allowed');
      result.current.set('from', toLocalInput('2026-09-01T00:00:00.000Z'));
    });
    act(() => {
      result.current.apply();
    });

    expect(apply).toHaveBeenCalledWith({
      sessionId: 'S1',
      decision: 'allowed',
      from: '2026-09-01T00:00:00.000Z',
    });
  });

  it('applies the end of the period too', () => {
    const apply = vi.fn();
    const { result } = renderHook(() => useAuditFilterDraft({}, apply));

    act(() => {
      result.current.set('toolName', 'Bash');
      result.current.set('to', toLocalInput('2026-09-02T00:00:00.000Z'));
    });
    act(() => {
      result.current.apply();
    });

    expect(apply).toHaveBeenCalledWith({ toolName: 'Bash', to: '2026-09-02T00:00:00.000Z' });
  });

  it('drops a decision the trail does not have', () => {
    const apply = vi.fn();
    const { result } = renderHook(() => useAuditFilterDraft({}, apply));

    act(() => {
      result.current.set('decision', 'maybe');
    });
    act(() => {
      result.current.apply();
    });

    expect(apply).toHaveBeenCalledWith({});
  });

  it('clears every filter at once', () => {
    const apply = vi.fn();
    const { result } = renderHook(() => useAuditFilterDraft({ toolName: 'Bash' }, apply));

    act(() => {
      result.current.clear();
    });

    expect(apply).toHaveBeenCalledWith({});
  });
});

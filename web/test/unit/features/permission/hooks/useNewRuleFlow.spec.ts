import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useNewRuleFlow } from '@/features/permission/hooks/useNewRuleFlow';

describe('useNewRuleFlow — the rule-authoring wizard’s own steps and draft (plan 15, B-27)', () => {
  it('starts at the first step, kind, with a blank draft when nothing is handed off', () => {
    const { result } = renderHook(() => useNewRuleFlow({}));

    expect(result.current.step).toBe('kind');
    expect(result.current.stepIndex).toBe(0);
    expect(result.current.draft).toMatchObject({
      kind: null,
      decision: null,
      scope: null,
      folder: null,
      expiresAt: null,
    });
  });

  it('seeds the draft from a hand-off — Recriar’s own decision, scope and folder, never a pattern (S-225)', () => {
    const { result } = renderHook(() =>
      useNewRuleFlow({ decision: 'deny', scope: 'project', folder: '/workspace/app' }),
    );

    expect(result.current.draft).toMatchObject({
      decision: 'deny',
      scope: 'project',
      folder: '/workspace/app',
      kind: null,
    });
  });

  it('seeds the draft from "duplicar" — the pattern un-templated back into kind, form and subject (B-30, S-204)', () => {
    const { result } = renderHook(() =>
      useNewRuleFlow({ pattern: 'shell(git status:*)', decision: 'allow', scope: 'always' }),
    );

    expect(result.current.draft).toMatchObject({
      kind: 'shell',
      form: 'prefix',
      subject: 'git status',
      decision: 'allow',
      scope: 'always',
    });
  });

  it('reads mcp’s own server and tool apart from a duplicated pattern', () => {
    const { result } = renderHook(() =>
      useNewRuleFlow({ pattern: 'mcp(github:create_issue)', decision: 'allow' }),
    );

    expect(result.current.draft).toMatchObject({
      kind: 'mcp',
      subject: 'github',
      mcpTool: 'create_issue',
    });
  });

  it('starts blank, rather than wrong, for a duplicated pattern outside this wizard’s own shapes', () => {
    const { result } = renderHook(() => useNewRuleFlow({ pattern: 'Bash(git status)' }));

    expect(result.current.draft).toMatchObject({ kind: null, subject: '', mcpTool: '' });
  });

  it('cannot advance from kind until one is chosen', () => {
    const { result } = renderHook(() => useNewRuleFlow({}));

    expect(result.current.canAdvance).toBe(false);

    act(() => {
      result.current.setDraft({ kind: 'shell' });
    });

    expect(result.current.canAdvance).toBe(true);
  });

  it('moves forward and back, never past either end', () => {
    const { result } = renderHook(() => useNewRuleFlow({ kind: 'shell' }));

    act(() => {
      result.current.back();
    });
    expect(result.current.step).toBe('kind');

    act(() => {
      result.current.next();
    });
    expect(result.current.step).toBe('pattern');

    act(() => {
      result.current.back();
    });
    expect(result.current.step).toBe('kind');

    act(() => {
      result.current.goTo('review');
    });
    act(() => {
      result.current.next();
    });
    expect(result.current.step).toBe('review');
  });

  it('cannot advance from decision until one is chosen', () => {
    const { result } = renderHook(() => useNewRuleFlow({ kind: 'shell' }));

    act(() => {
      result.current.goTo('decision');
    });
    expect(result.current.canAdvance).toBe(false);

    act(() => {
      result.current.setDraft({ decision: 'allow' });
    });
    expect(result.current.canAdvance).toBe(true);
  });

  it('the whole kind is always a complete pattern step — the server, not the wizard, calls breadth', () => {
    const { result } = renderHook(() => useNewRuleFlow({ kind: 'search' }));

    act(() => {
      result.current.goTo('pattern');
      result.current.setDraft({ form: 'any', subject: '' });
    });

    expect(result.current.canAdvance).toBe(true);
  });

  it('a subject-shaped pattern step needs something typed', () => {
    const { result } = renderHook(() => useNewRuleFlow({ kind: 'shell' }));

    act(() => {
      result.current.goTo('pattern');
    });
    expect(result.current.canAdvance).toBe(false);

    act(() => {
      result.current.setDraft({ form: 'exact', subject: 'git status' });
    });
    expect(result.current.canAdvance).toBe(true);
  });

  it('the folder step needs a folder only when the scope is project', () => {
    const { result } = renderHook(() => useNewRuleFlow({}));

    act(() => {
      result.current.goTo('folder');
      result.current.setDraft({ scope: 'always' });
    });
    expect(result.current.canAdvance).toBe(true);

    act(() => {
      result.current.setDraft({ scope: 'project', folder: null });
    });
    expect(result.current.canAdvance).toBe(false);

    act(() => {
      result.current.setDraft({ folder: '/workspace/app' });
    });
    expect(result.current.canAdvance).toBe(true);
  });

  it('the validity step needs an expiry', () => {
    const { result } = renderHook(() => useNewRuleFlow({}));

    act(() => {
      result.current.goTo('validity');
    });
    expect(result.current.canAdvance).toBe(false);

    act(() => {
      result.current.setDraft({ expiresAt: '2027-01-01T00:00:00.000Z' });
    });
    expect(result.current.canAdvance).toBe(true);
  });
});

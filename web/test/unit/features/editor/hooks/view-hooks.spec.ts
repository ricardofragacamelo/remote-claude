import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useCodeEditorEngine } from '@/features/editor/hooks/useCodeEditorEngine';
import { useCodeView } from '@/features/editor/hooks/useCodeView';
import { useDiffContent } from '@/features/editor/hooks/useDiffContent';
import { useDiffView } from '@/features/editor/hooks/useDiffView';
import { openFile } from '@/features/editor/hooks/tabs';
import { setEngineLoader } from '@/features/editor/lib/engine-loader';
import { createPlainEngine } from '@/features/editor/lib/plain-engine';
import { useCommands } from '@/features/commands';
import { useTheme } from '@/shared/hooks/useTheme';
import { claudeContextTargets } from '@/shared/lib/files-drag';
import { VIEW_OPTIONS } from '../../../../support/code-editor-contract';
import { FOLDER, editorState } from '../../../../support/editor';
import { fakeDisk } from '../../../../support/editor-disk';
import { providers } from '../../../../support/render';

afterEach(() => {
  vi.restoreAllMocks();
});

const wrapper = providers();

describe('loading the editor for a view', () => {
  it('lets go of a load that lands after the view went — and of one that fails then', async () => {
    let finish: (engine: ReturnType<typeof createPlainEngine>) => void = () => undefined;
    setEngineLoader('monaco', () => new Promise((resolve) => (finish = resolve)));
    const quiet = renderHook(() => useCodeEditorEngine(), { wrapper });
    quiet.unmount();
    finish(createPlainEngine());

    let fail: (error: Error) => void = () => undefined;
    setEngineLoader('monaco', () => new Promise((_, reject) => (fail = reject)));
    const gone = renderHook(() => useCodeEditorEngine(), { wrapper });
    gone.unmount();
    fail(new Error('offline'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(quiet.result.current.engine).toBeNull();
    expect(gone.result.current.error).toBeNull();
  });

  it('tries again after a failure, and sets the theme on the editor it got', async () => {
    const engine = createPlainEngine();
    const setTheme = vi.spyOn(engine, 'setTheme');
    setEngineLoader(
      'monaco',
      vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(engine),
    );
    const { result } = renderHook(() => useCodeEditorEngine(), { wrapper });

    await waitFor(() => {
      expect(result.current.error?.code).toBe('NETWORK_UNREACHABLE');
    });
    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.engine).toBe(engine);
    });
    act(() => {
      useTheme.getState().setTheme('dark');
    });
    expect(setTheme).toHaveBeenLastCalledWith('dark');
  });
});

describe('the texts of a diff', () => {
  it('lets go of a read that lands after the tab closed — and of one that fails then', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'a' });
    disk.hold('GET');
    const done = renderHook(
      () =>
        useDiffContent(
          FOLDER,
          { path: 'a.ts', source: 'disk' },
          { path: 'a.ts', source: 'buffer' },
        ),
      { wrapper },
    );
    const failed = renderHook(
      () =>
        useDiffContent(FOLDER, { path: 'gone', source: 'disk' }, { path: 'a.ts', source: 'disk' }),
      { wrapper },
    );
    done.unmount();
    failed.unmount();
    disk.release();
    await act(async () => {
      await Promise.resolve();
    });

    expect(done.result.current.status).toBe('loading');
    expect(failed.result.current.status).toBe('loading');
  });

  it('reads an empty side for a file the server says is still the one it has', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'a' });
    vi.spyOn(
      await import('@/features/editor/services/files.service'),
      'readFile',
    ).mockResolvedValue({ kind: 'notModified' });
    const { result } = renderHook(
      () =>
        useDiffContent(FOLDER, { path: 'a.ts', source: 'disk' }, { path: 'a.ts', source: 'disk' }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current).toMatchObject({ status: 'ready', original: '', modified: '' });
    });
    void disk;
  });
});

describe('the element a view is made in', () => {
  it('makes nothing for no element, and an editor for one', () => {
    fakeDisk(FOLDER, { 'a.ts': 'a' });
    openFile(FOLDER, 'a.ts');
    const engine = createPlainEngine();
    const content = {
      original: 'a',
      modified: 'b',
      language: 'plaintext',
      originalLabel: 'o',
      modifiedLabel: 'm',
    };

    const diff = renderHook(() => useDiffView(engine, content, VIEW_OPTIONS), { wrapper });
    const code = renderHook(
      () =>
        useCodeView({ folder: FOLDER, group: 'g', path: 'a.ts', engine, options: VIEW_OPTIONS }),
      { wrapper },
    );

    expect(diff.result.current(null)).toBeUndefined();
    expect(code.result.current(null)).toBeUndefined();

    const host = document.createElement('div');
    let release: unknown;
    act(() => {
      release = code.result.current(host);
    });
    // The file is still being read: the editor is made, and shows nothing yet.
    expect(host.querySelector('textarea')).toHaveValue('');
    act(() => {
      (release as () => void)();
    });
    expect(host.querySelector('textarea')).toBeNull();
  });
});

describe('what an editor of a file is wired to', () => {
  it('runs the sequences bound in it, the selection action, and leaves the save on blur to its preference', async () => {
    const disk = fakeDisk(FOLDER, { 'a.ts': 'a' });
    openFile(FOLDER, 'a.ts');
    await waitFor(() => {
      expect(editorState().docs['a.ts']?.status).toBe('ready');
    });
    const plain = createPlainEngine();
    const bound: (() => void)[] = [];
    const actions: (() => void)[] = [];
    const engine = {
      ...plain,
      createView: (host: HTMLElement, options: typeof VIEW_OPTIONS) => {
        const view = plain.createView(host, options);
        view.bindKey = (_key: string, run: () => void) => {
          bound.push(run);
          return () => undefined;
        };
        view.addContextAction = (action) => {
          actions.push(action.run);
          return () => undefined;
        };
        return view;
      },
    };
    const add = vi.fn();
    const stop = claudeContextTargets.register({ id: 'chat', position: 1, add });
    const keys = renderHook(
      () => {
        useCommands([
          {
            id: 'editor.testSequence',
            labelKey: 'command.editor.saveAll',
            category: 'file',
            run: vi.fn(),
            keys: [{ key: 'Mod+K Z', context: 'workbench' }],
          },
        ]);
      },
      { wrapper },
    );
    const code = renderHook(
      () =>
        useCodeView({ folder: FOLDER, group: 'g', path: 'a.ts', engine, options: VIEW_OPTIONS }),
      { wrapper },
    );
    const host = document.createElement('div');

    act(() => {
      code.result.current(host);
    });
    act(() => {
      for (const run of [...bound, ...actions]) run();
      host.querySelector('textarea')?.dispatchEvent(new Event('blur'));
    });

    expect(bound.length).toBeGreaterThan(0);
    expect(add).toHaveBeenCalledWith({ folder: FOLDER, entries: [{ path: 'a.ts', kind: 'file' }] });
    expect(disk.saves()).toEqual([]);
    stop();
    keys.unmount();
    code.unmount();
  });
});

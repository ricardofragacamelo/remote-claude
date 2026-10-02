import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { commandRegistry, executeCommand } from '@/features/commands';
import { useRegistry } from '@/shared/hooks/useRegistry';
import { claudeContextTargets } from '@/shared/lib/files-drag';
import { editorStoreOf, updateDoc } from '../store/editor.store';
import { useEditorPreferences } from '../store/preferences.store';
import type { CodeEditorEngine, CodeView, ViewOptions } from '../types/code-editor';
import { attachModel, documentOf, takeRestore } from './documents';
import { autoSave } from './saving';
import { addFileToClaude } from './text-actions';
import { showView } from './views';
import { useHosted } from './useHosted';
import { useDocument } from './useEditor';

/** What one editor of one tab shows. */
export interface CodeViewInput {
  readonly folder: string;
  readonly group: string;
  readonly path: string;
  readonly engine: CodeEditorEngine;
  readonly options: ViewOptions;
}

/** Remembers where a view was in a file — what coming back to the tab gives back (S-263). */
function keepPlace(folder: string, path: string, view: CodeView): void {
  updateDoc(editorStoreOf(folder), path, () => ({
    cursor: view.position(),
    selectionLength: view.selectionLength(),
    scrollTop: view.scrollTop(),
  }));
}

/** The keys of the editor's commands that are sequences: Monaco keeps `Ctrl+K` for its own. */
function bindSequences(view: CodeView, run: (command: string) => void): () => void {
  const undo = commandRegistry
    .bindings()
    .filter((binding) => binding.command.startsWith('editor.') && binding.key.includes(' '))
    .map((binding) =>
      view.bindKey(binding.key, () => {
        run(binding.command);
      }),
    );

  return () => {
    for (const each of undo) {
      each();
    }
  };
}

/**
 * One editor of one tab: made in the element the returned ref is put on, showing the file's one model
 * — shared with any other group that shows it (S-222) — and following the cursor, the auto-save on
 * blur (S-236) and the reloads that keep the cursor where it was (S-238).
 *
 * @returns the ref of the element the editor is made in
 */
export function useCodeView({
  folder,
  group,
  path,
  engine,
  options,
}: CodeViewInput): (element: HTMLDivElement | null) => (() => void) | undefined {
  const { t } = useTranslation();
  const ready = useDocument(folder, path)?.status === 'ready';
  const targets = useRegistry(claudeContextTargets);
  const make = useCallback(
    (host: HTMLDivElement, initial: ViewOptions) => engine.createView(host, initial),
    [engine],
  );
  const [view, ref] = useHosted(make, options);

  useEffect(() => {
    if (view === null || !ready) {
      return;
    }

    const model = attachModel(folder, path, engine);
    const { cursor, scrollTop } = documentOf(folder, path);
    view.setModel(model);
    view.setPosition(cursor);
    view.setScrollTop(scrollTop);

    const stops = [
      showView(folder, group, view),
      view.onCursorChange(() => {
        keepPlace(folder, path, view);
      }),
      model.onDidChange(() => {
        const restore = takeRestore(folder, path);

        if (restore !== undefined) {
          view.setPosition(restore.cursor);
          view.setScrollTop(restore.scrollTop);
        }
      }),
      view.onBlur(() => {
        if (useEditorPreferences.getState().preferences.autoSave === 'onFocusChange') {
          autoSave(folder, path);
        }
      }),
      bindSequences(view, (command) => {
        void executeCommand(command, t);
      }),
    ];

    return () => {
      keepPlace(folder, path, view);

      for (const stop of stops) {
        stop();
      }

      view.setModel(null);
    };
  }, [view, ready, folder, group, path, engine, t]);

  useEffect(() => {
    if (view === null || targets.length === 0) {
      return;
    }

    // "Add selection to chat", in the editor's own menu — only while somebody takes it (S-276).
    return view.addContextAction({
      id: 'addSelectionToClaude',
      label: t('editor.claude.addSelection'),
      run: () => {
        addFileToClaude(folder, path, view.selections());
      },
    });
  }, [view, targets, folder, path, t]);

  return ref;
}

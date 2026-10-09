import { StrictMode } from 'react';
import { expect, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';

// The barrel, as the app loads it: the editor registers itself in the workbench at load.
import '@/features/editor';
import { CommandHost, FileMenu, useKeyContext } from '@/features/commands';
import { EditorStatus } from '@/features/editor/components/EditorStatus';
import { EditorWorkspace } from '@/features/editor/components/EditorWorkspace';
import { OpenEditors, openFile } from '@/features/editor';
import { attachModel } from '@/features/editor/hooks/documents';
import { createPlainEngine } from '@/features/editor/lib/plain-engine';
import type { TextModel } from '@/features/editor/types/code-editor';
import { editorStoreOf } from '@/features/editor/store/editor.store';
import type { EditorState } from '@/features/editor/store/editor.store';
import type { LiveSocket } from './live-socket';
import { render, translator } from './render';

const t = translator('en');

/** The folder of the tab the editor specs work in. */
export const FOLDER = '/srv/projects/app';

/** The shortcuts of the workbench, live — the workbench itself holds them while it is on screen. */
function WorkbenchKeys(): null {
  useKeyContext('workbench');
  return null;
}

/**
 * The editor of a folder tab as the workbench shows it — inside `StrictMode` when `strict` — with the commands of the app live, so its
 * shortcuts and its palette work — "Open editors" beside it, as the Explorer view shows it, and its
 * part of the status bar.
 */
export function renderEditor(
  folder = FOLDER,
  options: { readonly strict?: boolean } = {},
): RenderResult {
  const editor = (
    <>
      <WorkbenchKeys />
      <CommandHost />
      <FileMenu />
      <OpenEditors folder={folder} />
      <EditorWorkspace folder={folder} />
      <EditorStatus
        tab={{ path: folder, name: 'app', rootLabel: null, state: 'available', kept: true }}
      />
    </>
  );

  // `StrictMode` runs every effect twice in development, as the app's dev server does — what a
  // reader drawn on a canvas, or laid out in a container, has to survive (plan 21, R-05).
  return render(options.strict === true ? <StrictMode>{editor}</StrictMode> : editor);
}

/** The editor of a file, once it is on screen — the simplified mode's text area, in jsdom. */
export function editorOf(name: string): Promise<HTMLTextAreaElement> {
  return screen.findByRole('textbox', {
    name: t('editor.view.label', { name }),
  }) as Promise<HTMLTextAreaElement>;
}

/** The state of the folder's editor, now. */
export function editorState(folder = FOLDER): EditorState {
  return editorStoreOf(folder).getState();
}

/**
 * Types into an editor as a person does — the text area gets the input event its view listens to.
 * `userEvent.type` would do too, character by character; a whole text at once keeps the specs short.
 */
export function typeInto(area: HTMLTextAreaElement, text: string): void {
  act(() => {
    area.value = text;
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Presses a key on an element, the way the shell's listener hears it. */
export function press(target: Element, init: KeyboardEventInit): void {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
    );
  });
}

/** `Ctrl+S`, pressed in an editor. */
export function pressSave(target: Element): void {
  press(target, { key: 's', code: 'KeyS', ctrlKey: true });
}

/** The strip of tabs of a group — the first one unless said. */
export function stripOf(place = 1): HTMLElement {
  return screen.getByRole('navigation', { name: t('editor.strip.label', { place }) });
}

/** A file opened in the folder's editor and read, with its text made — what a test edits. */
export async function openedModel(path: string, folder = FOLDER): Promise<TextModel> {
  openFile(folder, path);
  await vi.waitFor(() => {
    expect(editorStoreOf(folder).getState().docs[path]?.status).toBe('ready');
  });

  return attachModel(folder, path, createPlainEngine());
}

/** The folder followed on disk, through the real socket client — what a test changes it with. */
export interface WatchedFolder {
  /** The server says files changed — `origin` as it could tell. */
  changed(changes: readonly Record<string, unknown>[], overflow?: boolean): void;
}

/**
 * Answers the `workspace.watch` the editor sent for `folder`, and gives the way to send it changes —
 * numbered from 1, as the stream of a watch is (07 · D-07).
 */
export async function watched(
  socket: LiveSocket,
  folder = FOLDER,
  watchId = 'w-1',
): Promise<WatchedFolder> {
  await vi.waitFor(() => {
    expect(socket.sent().some((frame) => frame['type'] === 'workspace.watch')).toBe(true);
  });
  const request = socket
    .sent()
    .findLast(
      (frame) =>
        frame['type'] === 'workspace.watch' &&
        (frame['payload'] as Record<string, unknown>)['workspacePath'] === folder,
    );
  let seq = 0;

  socket.receive({
    v: 1,
    id: `ack-${watchId}`,
    kind: 'ack',
    type: 'workspace.watching',
    ts: '2026-10-01T00:00:00.000Z',
    correlationId: request?.['id'],
    payload: { watchId, workspacePath: folder },
  });

  return {
    changed: (changes, overflow) => {
      seq += 1;
      socket.receive({
        v: 1,
        id: `evt-${watchId}-${String(seq)}`,
        kind: 'event',
        type: 'workspace.filesChanged',
        ts: '2026-10-01T00:00:00.000Z',
        seq,
        payload: { watchId, changes, ...(overflow === undefined ? {} : { overflow }) },
      });
    },
  };
}

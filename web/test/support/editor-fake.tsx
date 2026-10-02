import { vi } from 'vitest';

// What the barrel hands over as it is — pure functions of a path and of a size (plan 07, F7).
import { canPreview } from '@/features/editor/lib/preview-kinds';
import { formatBytes } from '@/features/editor/lib/text';

/**
 * The editor's barrel, faked for the Explorer's tests — the two features are built side by side,
 * and the Explorer only ever reaches the editor through these (plan 07, F4 and F5).
 *
 * `vi.mock('@/features/editor', async () => (await import('…/editor-fake')).editorFake)`.
 */
let active: string | null = null;

export const editorFake = {
  openFile: vi.fn(),
  openDiff: vi.fn(),
  openPreview: vi.fn(),
  entryMoved: vi.fn(),
  canPreview,
  formatBytes,
  activeFile: vi.fn(() => active),
  useActiveFile: vi.fn(() => active),
  // What the local history's Timeline asks of a file before restoring it (plan 07, F8).
  heldFile: vi.fn(() => null),
  reloadFile: vi.fn(() => Promise.resolve()),
  OpenEditors: ({ folder }: { readonly folder: string }) => (
    <section aria-label="open-editors" data-folder={folder} />
  ),
  EditorLocation: () => null,
};

/** The file of the active editor tab, as the editor would say it. */
export function setActiveFile(path: string | null): void {
  active = path;
}

/** Every fake call forgotten, and no active file — between tests. */
export function resetEditorFake(): void {
  active = null;
  editorFake.openFile.mockClear();
  editorFake.openDiff.mockClear();
  editorFake.openPreview.mockClear();
  editorFake.entryMoved.mockClear();
}

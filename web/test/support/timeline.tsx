import { afterEach, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';

// The barrel, as the app loads it: the editor registers itself in the workbench at load.
import '@/features/editor';
import { CommandHost, useKeyContext } from '@/features/commands';
import { openFile } from '@/features/editor';
import { EditorWorkspace } from '@/features/editor/components/EditorWorkspace';
import { forgetTimeline, Timeline, useFileHistoryCommands } from '@/features/file-history';
import type { Locale } from '@/shared/i18n';
import { FOLDER, editorOf } from './editor';
import { fakeDisk } from './editor-disk';
import type { DiskFile, FakeDisk } from './editor-disk';
import { FakeHistory } from './history-api';
import { render, translator } from './render';

const t = translator('en');

afterEach(() => {
  forgetTimeline(null);
  vi.restoreAllMocks();
});

/** The editor of a folder tab beside its Timeline, with the commands of the app live. */
function TimelineHarness({
  folder,
  reveal,
}: {
  readonly folder: string;
  reveal(): void;
}): React.JSX.Element {
  useKeyContext('workbench');
  useFileHistoryCommands(folder, reveal);

  return (
    <>
      <CommandHost />
      <EditorWorkspace folder={folder} />
      <Timeline folder={folder} />
    </>
  );
}

/** What a Timeline spec works with. */
export interface RenderedTimeline {
  readonly disk: FakeDisk;
  readonly history: FakeHistory;

  /** What the commands call to put the Explorer on screen. */
  readonly reveal: ReturnType<typeof vi.fn>;
}

/** The Timeline of {@link FOLDER} over a fake disk and a fake local history. */
export function renderTimeline(
  files: Readonly<Record<string, string | DiskFile>>,
  options: {
    readonly locale?: Locale;
    readonly history?: FakeHistory;

    /** What `GET /files/limits` answers — `null`: it never does. */
    readonly limits?: Record<string, number> | null;
  } = {},
): RenderedTimeline {
  const disk = fakeDisk(FOLDER, files);
  const history = (options.history ?? new FakeHistory()).installOver(
    disk,
    options.limits === undefined ? { historyMaxFileBytes: 2_097_152 } : options.limits,
  );
  const reveal = vi.fn();

  render(<TimelineHarness folder={FOLDER} reveal={reveal} />, options.locale);
  return { disk, history, reveal };
}

/** Opens a file in the editor, and waits for its text. */
export async function opened(path: string): Promise<HTMLTextAreaElement> {
  act(() => {
    openFile(FOLDER, path);
  });
  return editorOf(path.slice(path.lastIndexOf('/') + 1));
}

/** The toggle of the section — what opens and closes it. */
export function timelineToggle(): HTMLElement {
  return screen.getByRole('button', { name: t('fileHistory.timeline.title') });
}

/** The versions of a path, once they are on screen. */
export async function versionsOf(path: string): Promise<HTMLElement[]> {
  const list = await screen.findByRole('list', {
    name: t('fileHistory.timeline.listLabel', { path }),
  });
  return within(list).getAllByRole('listitem');
}

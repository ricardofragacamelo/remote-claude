import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/shared/lib/utils';
import { FILES_DRAG_TYPE, readFilesDrag, scopeDragPayload } from '@/shared/lib/files-drag';
import type { ContextSet } from '../../hooks/useContextSet';
import { itemsOfPayload } from '../../lib/context-set';

export interface ContextDropZoneProps {
  readonly folder: string;
  readonly context: ContextSet;
  readonly children: React.ReactNode;

  /** Fills its place — the whole frame of the conversation is where a drag lands (plan 09, B-05). */
  readonly fill?: boolean;
}

/** Whether a drag carries what the context takes: entries of a tree or a tab, or desktop files. */
function carriesContext(types: readonly string[]): boolean {
  return types.includes(FILES_DRAG_TYPE) || types.includes('Files');
}

/**
 * Where a drag lands in the context of the next prompt (plan 08, B-49) — the composer and the whole
 * conversation around it. Entries of the tree and the tabs become chips, a folder one chip and never
 * its contents (S-233…S-235); files of the desktop become attachments, never files of the folder
 * (S-236). What comes from another folder tab is refused with the reason: the context is the
 * folder's (S-239). While something is dragged over it, it says what dropping does (S-240).
 */
export function ContextDropZone({
  folder,
  context,
  children,
  fill = false,
}: ContextDropZoneProps): React.JSX.Element {
  const { t } = useTranslation();
  const [over, setOver] = useState(false);

  return (
    <div
      className={cn(
        'relative flex flex-col gap-3',
        fill && 'min-h-0 flex-1 gap-0',
        over && 'rounded-md outline-2 outline-dashed outline-ring',
      )}
      onDragOver={(event) => {
        if (carriesContext([...event.dataTransfer.types])) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          setOver(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOver(false);
        }
      }}
      onDrop={(event) => {
        if (!carriesContext([...event.dataTransfer.types])) {
          return;
        }

        event.preventDefault();
        setOver(false);
        dropInto(folder, context, event.dataTransfer);
      }}
    >
      {over && (
        <p role="status" className={cn('text-ui-sm font-medium', fill && 'px-3 pt-2')}>
          {t('composer.drop.here')}
        </p>
      )}
      {children}
    </div>
  );
}

/** What a drop adds — and what it refuses, said on the set. */
function dropInto(folder: string, context: ContextSet, data: DataTransfer): void {
  const payload = readFilesDrag(data);

  if (payload === null) {
    context.addFiles([...data.files]);
    return;
  }

  const scoped = scopeDragPayload(payload, folder);

  if (scoped.payload !== null) {
    context.add(itemsOfPayload(scoped.payload));
  }

  if (scoped.refused.length > 0) {
    context.say({
      key: 'composer.drop.otherFolder',
      params: { count: scoped.refused.length },
    });
  }
}

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/shared/components/ui/button';
import { filterByName } from '../lib/filter-by-name';
import { useCreateArtifactFlow } from '../hooks/useCreateArtifactFlow';
import { ArtifactCardShell } from './ArtifactCardShell';
import { NewArtifactDialog } from './NewArtifactDialog';

/** Already translated — every string this card and its own "new <kind>" dialog need. */
export interface ArtifactListCardStrings {
  readonly title: string;
  readonly newLabel: string;
  readonly emptyTitle: string;
  readonly emptyBody: string;
  readonly searchLabel: string;
  readonly tableCaption: string;
  readonly columns: readonly string[];
  readonly newTitle: string;
  readonly newDescription: string;
  readonly newNameLabel: string;
}

export interface ArtifactListCardProps<T> {
  readonly headingId: string;
  readonly folder: string;
  readonly items: readonly T[];
  nameOf(item: T): string;
  /** The path to write, relative to `folder` — e.g. `.claude/commands/<name>.md`. */
  pathFor(name: string): string;
  /** The initial content of a new one, in English, with the kind's own frontmatter. */
  contentFor(name: string): string;
  /** Invalidated once the write settles — the query this card's own list is read from. */
  readonly invalidateKey: readonly unknown[];
  readonly strings: ArtifactListCardStrings;
  /** One full `<tr>`, for one item of the (searched) list. */
  renderRow(item: T): ReactNode;
}

/**
 * The project's own slash commands, subagents and output styles all list the same way (plan 13,
 * B-33, B-36, B-37): a title and a "new <kind>" button, searched, in a dense table, written by the
 * plan 07 file endpoint from a name and a template (D-18) — the one difference between them is what
 * a row shows, so that is the one thing a caller still supplies.
 */
export function ArtifactListCard<T>({
  headingId,
  folder,
  items,
  nameOf,
  pathFor,
  contentFor,
  invalidateKey,
  strings,
  renderRow,
}: ArtifactListCardProps<T>): React.JSX.Element {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const createFlow = useCreateArtifactFlow({
    folder,
    pathFor,
    contentFor,
    onCreated: () => {
      void queryClient.invalidateQueries({ queryKey: invalidateKey });
    },
  });
  const shown = useMemo(() => filterByName(items, search, nameOf), [items, search, nameOf]);

  return (
    <ArtifactCardShell
      headingId={headingId}
      title={strings.title}
      headerAction={
        <Button variant="outline" onClick={createFlow.openDialog}>
          {strings.newLabel}
        </Button>
      }
      isEmpty={items.length === 0}
      emptyTitle={strings.emptyTitle}
      emptyBody={strings.emptyBody}
      search={{ label: strings.searchLabel, value: search, onChange: setSearch }}
      tableCaption={strings.tableCaption}
      columns={strings.columns}
      dialog={
        <NewArtifactDialog
          flow={createFlow}
          title={strings.newTitle}
          description={strings.newDescription}
          nameLabel={strings.newNameLabel}
        />
      }
    >
      <tbody>{shown.map((item) => renderRow(item))}</tbody>
    </ArtifactCardShell>
  );
}

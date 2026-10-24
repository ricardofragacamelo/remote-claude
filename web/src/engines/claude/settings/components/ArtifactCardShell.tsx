import type { ReactNode } from 'react';

import { DenseTableFrame } from '@/shared/components/DenseTableFrame';
import { DenseTableHead } from '@/shared/components/DenseTableHead';
import { EmptyState } from '@/shared/components/EmptyState';
import { SearchField } from '@/shared/components/SearchField';

export interface ArtifactCardShellSearch {
  readonly label: string;
  readonly value: string;
  onChange(value: string): void;
}

export interface ArtifactCardShellProps {
  readonly headingId: string;
  readonly title: string;
  /** The "new <kind>" button, when this card offers one — `undefined` for a read-only card. */
  readonly headerAction?: ReactNode;
  readonly isEmpty: boolean;
  readonly emptyTitle: string;
  readonly emptyBody: string;
  /** The empty state's own action, when it differs from {@link headerAction} (Memory's own). */
  readonly emptyAction?: ReactNode;
  /** Shown once there is something to show, above the table — Hooks' own warning. */
  readonly beforeTable?: ReactNode;
  /** `undefined` for a card too short to search (Hooks, Permissions). */
  readonly search?: ArtifactCardShellSearch;
  readonly tableCaption: string;
  /** Already translated, in order — the name column first. */
  readonly columns: readonly string[];
  /** The table's own `<tbody>`. */
  readonly children: ReactNode;
  /** The card's own "new <kind>" dialog, when it has one. */
  readonly dialog?: ReactNode;
}

/**
 * The shape every card of the "Project" section's own table shares (plan 13, B-32, B-33, B-36, B-37,
 * B-38): a title (and, for the kinds this screen can create, a "new" button), a search field and a
 * dense table once there is something to show, an empty state otherwise — jscpd found every card
 * repeating this shell letter for letter, which is why it is a component here rather than five copies.
 */
export function ArtifactCardShell({
  headingId,
  title,
  headerAction,
  isEmpty,
  emptyTitle,
  emptyBody,
  emptyAction,
  beforeTable,
  search,
  tableCaption,
  columns,
  children,
  dialog,
}: ArtifactCardShellProps): React.JSX.Element {
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id={headingId} className="font-ui-strong text-ui">
          {title}
        </h3>
        {headerAction}
      </div>

      {isEmpty ? (
        <EmptyState title={emptyTitle} description={emptyBody} action={emptyAction} />
      ) : (
        <>
          {beforeTable}
          {search !== undefined && (
            <SearchField label={search.label} value={search.value} onChange={search.onChange} />
          )}
          <DenseTableFrame caption={tableCaption}>
            <DenseTableHead columns={columns} />
            {children}
          </DenseTableFrame>
        </>
      )}

      {dialog}
    </section>
  );
}

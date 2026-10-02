import { cn } from '@/shared/lib/utils';

export interface PathListProps {
  /** What the list is — its accessible name, translated. */
  readonly label: string;
  readonly paths: readonly string[];
  readonly className?: string;
}

/**
 * Paths a question is about, one per line, in full and in the code font — the folders a close asks
 * about, the files with unsaved changes it would lose. Never truncated: the person decides on them.
 */
export function PathList({ label, paths, className }: PathListProps): React.JSX.Element {
  return (
    <ul aria-label={label} className={cn('flex flex-col gap-1', className)}>
      {paths.map((path) => (
        <li key={path} className="font-code text-ui-sm break-all">
          {path}
        </li>
      ))}
    </ul>
  );
}

import { Skeleton } from '@/shared/components/ui/skeleton';

/** A file being read, in the shape of the editor it is going to be. */
export function PaneLoading(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 p-4" aria-hidden>
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

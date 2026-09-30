import { Skeleton } from '@/shared/components/ui/skeleton';

/**
 * A screen still deciding what it shows — the sign-in not known yet, the folder tabs not read yet:
 * the place of the screen held, with what is awaited told to a screen reader.
 */
export function ScreenLoading({ label }: { readonly label: string }): React.JSX.Element {
  return (
    <div className="p-4 md:p-6">
      <Skeleton className="h-48 w-full" aria-label={label} />
    </div>
  );
}

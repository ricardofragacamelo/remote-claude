import { useId, useState } from 'react';

import { Button } from '@/shared/components/ui/button';

export interface DisclosureProps {
  /** What the button says. Already translated. */
  readonly label: string;

  /** What the region is called, for whoever reaches it without seeing it. Already translated. */
  readonly title: string;

  /**
   * What opens. Mounted only while open — so whatever it asks the server for is asked when
   * somebody looks, not on every visit to the screen — and handed the way to close it.
   */
  children(close: () => void): React.ReactNode;
}

/**
 * A button that opens a region below it, and closes it again.
 *
 * The session screen carries two of them — the command menu and the undo — and neither is what
 * somebody opened the screen for. Written once, because the two copies would be the same twenty
 * lines of `aria-expanded` bookkeeping, and the one not written every day is the one that forgets
 * to name the region it controls.
 */
export function Disclosure({ label, title, children }: DisclosureProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const regionId = useId();

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="self-start"
        aria-expanded={open}
        aria-controls={open ? regionId : undefined}
        onClick={() => {
          setOpen((previous) => !previous);
        }}
      >
        {label}
      </Button>

      {open && (
        <section
          id={regionId}
          aria-label={title}
          className="flex flex-col gap-3 rounded-lg border border-border p-3"
        >
          {children(() => {
            setOpen(false);
          })}
        </section>
      )}
    </div>
  );
}

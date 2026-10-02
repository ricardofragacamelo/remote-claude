import { useCallback, useEffect, useState } from 'react';

/** What an element holds — an editor, a diff — told its options, and let go of. */
interface Hosted<O> {
  update(options: O): void;
  dispose(): void;
}

/**
 * Something made in the element the returned ref is put on, with the options of the first render,
 * told every later change of them, and disposed of with its element: it lives exactly as long as its
 * host. `make` decides when it is made again — keep it stable (`useCallback`).
 *
 * @returns what was made, while it is, and the ref of its host
 */
export function useHosted<O, T extends Hosted<O>>(
  make: (host: HTMLDivElement, initial: O) => T,
  options: O,
): readonly [T | null, (host: HTMLDivElement | null) => (() => void) | undefined] {
  const [made, setMade] = useState<T | null>(null);
  const [initial] = useState(options);

  useEffect(() => {
    made?.update(options);
  }, [made, options]);

  const ref = useCallback(
    (host: HTMLDivElement | null) => {
      if (host === null) {
        return undefined;
      }

      const each = make(host, initial);
      setMade(each);

      return () => {
        each.dispose();
        setMade(null);
      };
    },
    [make, initial],
  );

  return [made, ref];
}

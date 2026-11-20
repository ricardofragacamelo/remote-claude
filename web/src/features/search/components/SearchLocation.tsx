import { useSearchLocation } from '../hooks/useSearchLocation';
import type { SearchLocationValue } from '../hooks/useSearchLocation';

export interface SearchLocationProps {
  readonly folder: string;
  readonly search: SearchLocationValue;

  /** Writes the view's own query and toggles to the address. Has to be stable across renders. */
  onSearch(search: SearchLocationValue): void;
}

/**
 * Keeps the Search view's query and toggles, and the address, in step — rendered by the route
 * beside the workbench of the folder, since the view never learns that a router exists. Shows
 * nothing (plan 11, B-15, S-120).
 */
export function SearchLocation({ folder, search, onSearch }: SearchLocationProps): null {
  useSearchLocation(folder, search, onSearch);
  return null;
}

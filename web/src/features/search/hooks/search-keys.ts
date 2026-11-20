import type { LocateQuery, ReplaceQuery, SearchQuery } from '../types/search';

/**
 * The query keys of the feature, in one place — `searchKeys.all` drops the whole tree at once
 * (docs/architecture/web/04-state-and-data.md#chaves-hierárquicas-em-um-lugar-só). Every key
 * carries the **folder of the tab** first: nothing of one tab's search ever answers another's.
 */
export const searchKeys = {
  all: ['search'] as const,
  locate: (folder: string, request: LocateQuery) =>
    [...searchKeys.all, 'locate', folder, request] as const,
  text: (folder: string, request: SearchQuery) =>
    [...searchKeys.all, 'text', folder, request] as const,
  replacePreview: (folder: string, request: ReplaceQuery) =>
    [...searchKeys.all, 'replace-preview', folder, request] as const,
};

/**
 * What the search and the locator skip without being asked — plan 11, D-03.
 *
 * `.git` is pulled out on its own: it is skipped **always**, even with "use exclusions and
 * ignore files" switched off, which nothing else here is. The rest reuses the tree's own defaults
 * ([`UNWATCHED_PATHS`](../../files) of plan 07, D-10) plus the `search.exclude` VS Code itself
 * ships with — `node_modules` twice over is not a bug, the two lists exist for different reasons
 * and happen to agree here.
 */
export const ALWAYS_EXCLUDED_GLOB = '.git';

export const DEFAULT_SEARCH_EXCLUDE_GLOBS: readonly string[] = [
  '**/node_modules',
  '**/bower_components',
  '**/*.code-search',
  '**/dist',
  '**/build',
  '**/.venv',
  '**/target',
  '**/.DS_Store',
  '**/Thumbs.db',
];

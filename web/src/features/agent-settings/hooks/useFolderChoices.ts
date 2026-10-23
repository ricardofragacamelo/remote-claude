/**
 * Which folder a section can be about: none — the user's own defaults — or one of the open tabs and
 * the recent folders of the workbench (plan 13, B-16, S-182). The folder goes in the address, so the
 * link reproduces the screen; a folder the address names that is no longer among them still shows.
 *
 * `workspace` owns the real composition (it already owns both lists this combines) — `mcp`'s own
 * `McpFolderPicker` offers the same choice, through the same function (plan 13, B-28, D-83).
 */
export { useFolderChoices } from '@/features/workspace';

/**
 * Which folder this screen can be about: the open tabs and the recent folders of the workbench,
 * plus whatever the address already names (plan 13, B-16's own text, D-16, S-182) — the same
 * function `agentSettings`'s own `FolderPicker` already uses, through `workspace`, which owns both
 * lists this combines (plan 13, B-28, D-83): never imported from `agentSettings` directly, since
 * `agentSettings` registers this feature's own section (`McpSection`) and importing its barrel back
 * from here would close a module cycle between the two.
 */
export { useFolderChoices } from '@/features/workspace';

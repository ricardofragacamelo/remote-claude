// The canonical modes are part of what an engine announces (`capabilities.permissionModes`), so they
// live in the `engine` domain (plan 28, B-26); a session runs in one, and re-exports them.
export { PERMISSION_MODES, canonicalPermissionMode, isPermissionMode } from '@domain/engine';
export type { PermissionMode } from '@domain/engine';

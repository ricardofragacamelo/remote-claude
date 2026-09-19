/** Public surface of the `permission` feature. */
export { PermissionQueuePanel } from './components/PermissionQueue';
export { usePermissionQueue } from './hooks/usePermissionQueue';
export { usePermissionQueueStore } from './store/permission.store';
export type {
  PermissionDecision,
  PermissionOutcome,
  PermissionRequest,
  PermissionScope,
  RiskHint,
} from './types/permission';

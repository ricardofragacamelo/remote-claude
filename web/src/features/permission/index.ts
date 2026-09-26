/** Public surface of the `permission` feature. */
export { PermissionQueuePanel } from './components/PermissionQueue';
export { RuleList } from './components/RuleList';
export { RuleDetail } from './components/RuleDetail';
export { usePermissionRules } from './hooks/usePermissionRules';
export { usePermissionQueue } from './hooks/usePermissionQueue';
export { usePermissionQueueStore } from './store/permission.store';
export type {
  PermissionDecision,
  PermissionOutcome,
  PermissionRequest,
  PermissionScope,
  PersistedScope,
  RiskHint,
} from './types/permission';
export type { ListedRule, PermissionRule, RuleStatus } from './types/rule';

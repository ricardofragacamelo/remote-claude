/** Public surface of the `permission` domain. Another domain imports this file, never a deep path. */
export { PermissionRequest } from './entities/permission-request.entity';
export type {
  PermissionAnswer,
  PermissionExtension,
  PermissionDecision,
  PermissionOrigin,
  PermissionRequestOpening,
  PermissionRequestStatus,
  PermissionSettling,
  PermissionResolution,
} from './entities/permission-request.entity';
export { PermissionRule } from './entities/permission-rule.entity';
export type {
  PermissionRuleDraft,
  PermissionRuleScope,
  PermissionRuleSnapshot,
  PermissionRuleStatus,
  RuleSubject,
} from './entities/permission-rule.entity';
export { classifyRisk } from './services/risk.classifier';
export {
  matchedInput,
  parseRulePattern,
  patternForInvocation,
  ruleMatches,
} from './services/rule-pattern';
export type { RulePattern, RulePatternKind } from './services/rule-pattern';
export { answeringRule } from './services/rule-precedence';
export type { RuleQuestion } from './services/rule-precedence';
export {
  PERMISSION_SCOPES,
  PERSISTED_PERMISSION_SCOPES,
  isPermissionScope,
  isPersistedPermissionScope,
} from './value-objects/permission-scope.value-object';
export type {
  PermissionScope,
  PersistedPermissionScope,
} from './value-objects/permission-scope.value-object';
export { RISK_HINTS } from './value-objects/risk-hint.value-object';
export type { RiskHint } from './value-objects/risk-hint.value-object';
export { PermissionExtensionLimitReachedError } from './errors/permission-extension-limit.error';
export { PermissionNotOwnedError } from './errors/permission-not-owned.error';
export { PermissionReasonRequiredError } from './errors/permission-reason-required.error';
export { PermissionRequestExpiredError } from './errors/permission-request-expired.error';
export { PermissionRequestNotFoundError } from './errors/permission-request-not-found.error';
export { PermissionScopeUnsupportedError } from './errors/permission-scope-unsupported.error';
export { PermissionRuleExpiryTooLongError } from './errors/permission-rule-expiry-too-long.error';
export { PermissionRulePatternInvalidError } from './errors/permission-rule-pattern-invalid.error';
export { PermissionRuleExpiryInvalidError } from './errors/permission-rule-expiry-invalid.error';
export { PermissionRuleNotFoundError } from './errors/permission-rule-not-found.error';
export { PermissionRuleNotOwnedError } from './errors/permission-rule-not-owned.error';

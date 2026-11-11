/** Public surface of the `permission` feature. */
export { PermissionRequestCard } from './components/PermissionRequestCard';
export { PermissionOutcomeLine } from './components/PermissionOutcomeLine';
export { AnsweredQuestions } from './components/AnsweredQuestions';
export type { QuestionEnd } from './components/AnsweredQuestions';
export type { QuestionHandlers } from './components/PermissionRequestCard';
export { asksQuestion, readAnswers, readInteraction } from './services/permission.service';
export { RuleDetailPanel, RuleAlerts } from './components/RuleDetailPanel';
export type { RuleDetailPanelProps } from './components/RuleDetailPanel';
export { RulesScreen } from './components/RulesScreen';
export type { RulesScreenProps } from './components/RulesScreen';
export {
  readRulesSearch,
  DEFAULT_RULES_SEARCH,
  rulesListQuery,
  ruleSummaryFilters,
} from './lib/rules-search';
export type { RuleTab, RulesSearch } from './lib/rules-search';
export { useRules, ruleQueryKey } from './hooks/useRules';
export type { Rules } from './hooks/useRules';
export { useRuleSummary } from './hooks/useRuleSummary';
export { useRuleExpiryReminder } from './hooks/useRuleExpiryReminder';
export { RulesNavBadge } from './components/RulesNavBadge';
export { rulesHelpExtras } from './lib/rules-help-extras';
export type { RulesHelpExtra } from './lib/rules-help-extras';
export { rulesScreenHelp } from './lib/rules-help';
export {
  NEW_RULE_KINDS,
  isNewRuleKind,
  subjectFieldOf,
  allowsPrefix,
} from './lib/rule-kind-fields';
export type { NewRuleKind, SubjectField } from './lib/rule-kind-fields';
export { patternOf } from './lib/new-rule-pattern';
export type { NewRuleForm, NewRulePatternDraft } from './lib/new-rule-pattern';
export { readNewRuleSearch } from './lib/new-rule-search';
export type { NewRuleSearch } from './lib/new-rule-search';
export { NewRuleWizard } from './components/NewRuleWizard';
export type { NewRuleWizardProps } from './components/NewRuleWizard';
export { useNewRuleFlow } from './hooks/useNewRuleFlow';
export type { NewRuleDraft, NewRuleFlow, NewRuleStep } from './hooks/useNewRuleFlow';
export { useRulePreview } from './hooks/useRulePreview';
export { useRuleSimulation } from './hooks/useRuleSimulation';
export { useRuleEvaluation } from './hooks/useRuleEvaluation';
export { CommandTestPanel } from './components/CommandTestPanel';
export type { CommandTestPanelProps } from './components/CommandTestPanel';
export { TESTABLE_MODES, evaluationInputOf } from './lib/evaluate-input';
export type { CommandTestDraft, DraftRuleHandoff, TestableMode } from './lib/evaluate-input';
export { verdictOf } from './lib/evaluation-verdict';
export type { Verdict } from './lib/evaluation-verdict';
export { useRuleMutations } from './hooks/useRuleMutations';
export type {
  ChangeRuleExpiryResult,
  RuleMutationFailure,
  RuleMutations,
} from './hooks/useRuleMutations';
export { usePermissionQueue } from './hooks/usePermissionQueue';
export type { PermissionQueue } from './hooks/usePermissionQueue';
export { KeepPermissionsAttached } from './components/KeepPermissionsAttached';
export { forgetPermissionQueues, permissionQueueOf } from './store/permission.store';
export type { PlanMode } from './components/PlanApprovalCard';
export type {
  PermissionDecision,
  PermissionOutcome,
  PermissionRequest,
  PermissionScope,
  PersistedScope,
  Interaction,
  QuestionAnswer,
  QuestionInteraction,
  RiskHint,
} from './types/permission';
export type {
  ApplyRuleImportInput,
  ChangeRuleExpiryInput,
  EvaluateRuleInput,
  GrantRuleInput,
  ListedRule,
  PermissionRule,
  PreviewRuleInput,
  RuleBatch,
  RuleDisabled,
  RuleEvaluation,
  RuleExport,
  RuleFilters,
  RuleImportPreview,
  RuleImportResult,
  RuleListQuery,
  RuleOrder,
  RulePage,
  RulePreview,
  RuleSimulation,
  RuleSort,
  RuleStatus,
  RuleSummary,
  RuleTemplates,
  SimulateRulesInput,
} from './types/rule';

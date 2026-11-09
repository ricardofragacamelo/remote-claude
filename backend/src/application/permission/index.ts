/** Public surface of the `permission` use cases. */
export { PermissionRegistry } from './permission-registry';
export { answerableRequest } from './answerable-request';
export type { Answerer } from './answerable-request';
export { PermissionDeadlines } from './permission-deadlines';
export type { DeadlineFailureReporter } from './permission-deadlines';
export { PermissionSettlement } from './settle-permission';
export type { SettlementOptions } from './settle-permission';
export type { PermissionSettings } from './permission-settings';
export { RequestPermissionUseCase } from './request-permission.use-case';
export { PermissionAutoAnswer } from './permission-auto-answer';
export { ApplyPermissionModeUseCase } from './apply-permission-mode.use-case';
export type { PermissionOutcome } from './request-permission.use-case';
export { ResolvePermissionUseCase } from './resolve-permission.use-case';
export { ExtendPermissionUseCase } from './extend-permission.use-case';
export type { ExtendPermissionCommand } from './extend-permission.use-case';
export { EndSessionPermissionsUseCase } from './end-session-permissions.use-case';
export { DescribePermissionUseCase } from './describe-permission.use-case';
export { PermissionRuleBook } from './permission-rule-book';
export type { RuleLookup, RuleLookupFailureReporter } from './permission-rule-book';
export { answersPayload } from './permission-payloads';
export type { AnswerPayload } from './permission-payloads';
export { GrantPermissionRuleUseCase } from './grant-permission-rule.use-case';
export { RevokePermissionRuleUseCase } from './revoke-permission-rule.use-case';
export { RevokePermissionRulesUseCase } from './revoke-permission-rules.use-case';
export { RestorePermissionRulesUseCase } from './restore-permission-rules.use-case';
export { ChangePermissionRuleExpiryUseCase } from './change-permission-rule-expiry.use-case';
export { RevokeMcpServerRulesUseCase } from './revoke-mcp-server-rules.use-case';
export { ListPermissionRulesUseCase } from './list-permission-rules.use-case';
export { DescribePermissionRuleUseCase } from './describe-permission-rule.use-case';
export type {
  ListedPermissionRule,
  ListedPermissionRuleItem,
  PermissionRuleSearchResult,
  SearchPermissionRulesQuery,
} from './list-permission-rules.use-case';
export { SummarizePermissionRulesUseCase } from './summarize-permission-rules.use-case';
export { ListRuleInvocationsUseCase } from './list-rule-invocations.use-case';
export { ListRuleHistoryUseCase } from './list-rule-history.use-case';
export type {
  GrantedProjectPath,
  GrantPermissionRuleCommand,
} from './commands/grant-permission-rule.command';
export type { DescribePermissionQuery, PermissionState } from './describe-permission.use-case';
export type { RequestPermissionCommand } from './commands/request-permission.command';
export type { ResolvePermissionCommand } from './commands/resolve-permission.command';
export type { PermissionBroadcaster, PermissionFrame } from './ports/permission-broadcaster.port';
export { PERMISSION_BROADCASTER } from './ports/permission-broadcaster.port';
export type {
  PermissionEvents,
  PermissionRequestedEvent,
  PermissionResolvedEvent,
} from './ports/permission-events.port';
export { PERMISSION_EVENTS } from './ports/permission-events.port';
export type { PermissionRequestRepository } from './ports/permission-request.repository';
export { PERMISSION_REQUEST_REPOSITORY } from './ports/permission-request.repository';
export type {
  PermissionRuleCursor,
  PermissionRuleListFilter,
  PermissionRuleListPage,
  PermissionRuleListRequest,
  PermissionRuleRepository,
  PermissionRuleSortField,
  PermissionRuleSortOrder,
  PermissionRuleSummary,
  RuleExpiryChange,
  RuleGrant,
  RuleRevocation,
} from './ports/permission-rule.repository';
export {
  EMPTY_PERMISSION_RULE_FILTER,
  PERMISSION_RULE_REPOSITORY,
  PERMISSION_RULE_SORT_FIELDS,
} from './ports/permission-rule.repository';
export type { RuleFolderResolver } from './ports/rule-folder-resolver.port';
export { RULE_FOLDER_RESOLVER } from './ports/rule-folder-resolver.port';
export type { QuestionRecord, QuestionRecordSource } from './ports/question-record.source';
export { QUESTION_RECORD_SOURCE } from './ports/question-record.source';
export { decodeRuleCursor, encodeRuleCursor } from './permission-rule-cursor';
export { RuleDialects, NO_DIALECT } from './rule-dialects';
export type { RuleDialect, RuleTranslation } from './ports/rule-dialect.port';
export { ENGINE_RULE_DIALECTS } from './ports/rule-dialect.port';
export {
  BACKFILL_BATCH,
  INVALID_TRANSLATION,
  MigrateRulesUseCase,
  RuleMigrationCountError,
  UNTRANSLATABLE,
} from './migrate-rules.use-case';
export type { DisabledRule, RuleMigrationReport } from './migrate-rules.use-case';
export type { NativeRule, RuleMigrationStore } from './ports/rule-migration.store';
export { RULE_MIGRATION_STORE } from './ports/rule-migration.store';
export type {
  InvocationKind,
  InvocationTable,
  ToolKindBackfillStore,
  UntaggedInvocation,
} from './ports/tool-kind-backfill.store';
export { INVOCATION_TABLES, TOOL_KIND_BACKFILL_STORE } from './ports/tool-kind-backfill.store';
export { EvaluatePermissionUseCase } from './evaluate-permission.use-case';
export type {
  EvaluationCaveat,
  EvaluationDraft,
  EvaluationOutcome,
  EvaluationReason,
  EvaluatePermissionCommand,
  PermissionEvaluation,
} from './evaluate-permission.use-case';
export { PreviewPermissionRuleUseCase } from './preview-permission-rule.use-case';
export type {
  PermissionRuleDraftInput,
  PermissionRulePreview,
} from './preview-permission-rule.use-case';
export { toAnalyzable } from './rule-analysis-adapter';
export { draftPermissionRule } from './draft-permission-rule';
export type { RuleDraft } from './draft-permission-rule';
export { decideOutcome } from './decide-outcome';
export type { Decided, DecisionOutcome, DecisionReason } from './decide-outcome';
export {
  SimulatePermissionRulesUseCase,
  SIMULATE_DEFAULT_LIMIT,
  SIMULATE_MAX_LIMIT,
} from './simulate-permission-rules.use-case';
export type {
  PermissionSimulation,
  SimulatePermissionRulesCommand,
  SimulationChange,
  SimulationCountKey,
  SimulationDraft,
} from './simulate-permission-rules.use-case';
export { isKnownRuleTemplateId, ruleTemplateCatalog } from './rule-templates';
export type { RuleTemplate, RuleTemplateMessage, RuleTemplateRule } from './rule-templates';
export { ListRuleTemplatesUseCase } from './list-rule-templates.use-case';
export {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_RULES,
  RULE_EXPORT_FORMAT,
  RULE_EXPORT_VERSION,
  digestOfImportFile,
  exportItemOf,
  parseImportFile,
  structuralFieldsOf,
  verdictOfImportItem,
} from './rule-export-file';
export type {
  ImportItemVerdict,
  ImportLifetimes,
  ParsedImportFile,
  RuleExportFile,
  RuleExportItem,
  StructuralFields,
} from './rule-export-file';
export { ExportPermissionRulesUseCase } from './export-permission-rules.use-case';
export { PreviewRuleImportUseCase } from './preview-rule-import.use-case';
export type { PreviewedImportItem, RuleImportPreview } from './preview-rule-import.use-case';
export { ImportPermissionRulesUseCase } from './import-permission-rules.use-case';
export type {
  ImportRuleCommand,
  RuleImportCounts,
  RuleImportResult,
} from './import-permission-rules.use-case';

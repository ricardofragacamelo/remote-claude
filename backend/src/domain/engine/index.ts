/** Public surface of the `engine` domain: which coding agent, which conversation, what it can do. */
export { EngineId } from './value-objects/engine-id.value-object';
export { ConversationRef } from './value-objects/conversation-ref.value-object';
export type {
  EngineCapabilities,
  EngineCapability,
} from './value-objects/engine-capabilities.value-object';
export { hasCapability, requireCapability } from './value-objects/engine-capabilities.value-object';
export type {
  EngineDescription,
  EngineState,
} from './value-objects/engine-description.value-object';
export type { KnownToolKind, ToolKind } from './value-objects/tool-kind.value-object';
export type {
  CanonicalTool,
  EngineOrigin,
  FileChange,
  FileEdit,
  ReadWindow,
  ToolLabel,
  ToolSubject,
} from './value-objects/canonical-tool.value-object';
export { isKnownToolKind, KNOWN_TOOL_KINDS } from './value-objects/tool-kind.value-object';
export { pathsChangedBy, toolKindKey } from './value-objects/canonical-tool.value-object';
export { QUESTION_LIMITS } from './value-objects/interaction.value-object';
export {
  PERMISSION_MODES,
  canonicalPermissionMode,
  isPermissionMode,
} from './value-objects/permission-mode.value-object';
export type { PermissionMode } from './value-objects/permission-mode.value-object';
export type { TaskItem, TaskStatus, TaskStep } from './value-objects/task-step.value-object';
export type {
  Interaction,
  PlanInteraction,
  Question,
  QuestionAnswer,
  QuestionInteraction,
  QuestionOption,
} from './value-objects/interaction.value-object';
export { AgentTimeoutError } from './errors/agent-timeout.error';
export { AgentUnavailableError } from './errors/agent-unavailable.error';
export { EngineCapabilityUnavailableError } from './errors/engine-capability-unavailable.error';
export { InvalidConversationRefError } from './errors/invalid-conversation-ref.error';

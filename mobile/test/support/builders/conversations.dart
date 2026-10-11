/// Conversations and engines, as a test names them.
///
/// The engine of a test is a made-up id — the app never decides by it, so no test needs a real one,
/// and a test that used one would only prove the app knows that name (plan 28, B-13).
library;

import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/features/session/domain/entities/engine.dart';

/// The engine every conversation of a test is kept by, unless the test says otherwise.
const String anEngine = 'engine-a';

/// How the backend names [anEngine] on screen.
const String anEngineName = 'Agent A';

/// The conversation [id] of [engine].
ConversationKey conversationOf(String id, {String engine = anEngine}) =>
    ConversationKey(engine: engine, id: id);

/// The conversation [id] of [engine], as the contract writes it.
Map<String, Object?> conversationJson(String id, {String engine = anEngine}) => <String, Object?>{
  'engine': engine,
  'id': id,
};

/// A whole declaration of capabilities, as the contract writes it, with [overrides] on top.
Map<String, Object?> capabilitiesJson([
  Map<String, Object?> overrides = const <String, Object?>{},
]) => <String, Object?>{
  'resume': true,
  'fork': 'atMessage',
  'history': true,
  'images': true,
  'promptWhileBusy': true,
  'questions': true,
  'planApproval': true,
  'taskList': true,
  'subagents': true,
  'thinking': true,
  'slashCommands': true,
  'modelSwitch': true,
  'effortLevels': <Object?>['low', 'high'],
  'contextUse': true,
  'mcp': true,
  'compaction': true,
  'cost': 'usd',
  'permissionModes': <Object?>['ask', 'acceptEdits', 'readOnly', 'allowAll'],
  ...overrides,
};

/// What [capabilitiesJson] declares, as the app reads it.
const EngineCapabilities someCapabilities = EngineCapabilities(
  resume: true,
  fork: 'atMessage',
  history: true,
  images: true,
  promptWhileBusy: true,
  questions: true,
  planApproval: true,
  taskList: true,
  subagents: true,
  thinking: true,
  slashCommands: true,
  modelSwitch: true,
  effortLevels: <String>['low', 'high'],
  contextUse: true,
  mcp: true,
  compaction: true,
  cost: 'usd',
  permissionModes: <String>['ask', 'acceptEdits', 'readOnly', 'allowAll'],
);

/// One engine of `GET /engines`, as the contract writes it, with [overrides] on top.
Map<String, Object?> engineJson([Map<String, Object?> overrides = const <String, Object?>{}]) =>
    <String, Object?>{
      'id': anEngine,
      'displayName': anEngineName,
      'state': 'available',
      'reason': null,
      'version': '1.2.3',
      'capabilities': capabilitiesJson(),
      ...overrides,
    };

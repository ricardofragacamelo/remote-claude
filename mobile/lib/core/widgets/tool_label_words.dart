/// The words of a tool call's label: the `messageKey` the backend built, translated with its params
/// (plan 28, B-19).
///
/// In `core/` because two features draw the same label without knowing each other — the row of the
/// conversation and the permission card —, and the web draws it from the paired keys of
/// `scripts/i18n-shared.json`, so the three say the same thing. The client never builds a label of its
/// own, and never from the engine's name for a tool: a key it has no words for, or a kind it does not
/// know, is the generic line.
library;

import 'package:remote_claude/core/conversation/tool_call.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The kinds of the contract this build knows. Any other is drawn as the generic line (S-59).
const Set<String> knownToolKinds = <String>{
  'file.read',
  'file.edit',
  'file.write',
  'file.delete',
  'file.move',
  'search',
  'shell',
  'shell.output',
  'web.fetch',
  'web.search',
  'mcp',
  'agent',
  'question',
  'plan',
  'tasks',
  'other',
};

/// One label key, in words.
typedef _Words = String Function(AppLocalizations l10n, _Params params);

/// The params of a label, read as text: a value that is absent is an empty gap, never `null`.
extension type const _Params(Map<String, Object> values) {
  String operator [](String name) => switch (values[name]) {
    final Object value => '$value',
    null => '',
  };
}

/// Every label key the backend builds, by the wire key — a table of the generated getters rather than
/// a key assembled at runtime, so a missing translation is a compile error.
final Map<String, _Words> _labels = <String, _Words>{
  'sessions.tool.fileRead': (AppLocalizations l10n, _Params p) =>
      l10n.sessionToolFileRead(p['path']),
  'sessions.tool.fileEdit': (AppLocalizations l10n, _Params p) =>
      l10n.sessionToolFileEdit(p['path'], p['added'], p['removed']),
  'sessions.tool.fileEditMany': (AppLocalizations l10n, _Params p) =>
      l10n.sessionToolFileEditMany(p['path']),
  'sessions.tool.fileEditCell': (AppLocalizations l10n, _Params p) =>
      l10n.sessionToolFileEditCell(p['path']),
  'sessions.tool.fileWrite': (AppLocalizations l10n, _Params p) =>
      l10n.sessionToolFileWrite(p['path'], p['lines']),
  'sessions.tool.shell': (AppLocalizations l10n, _Params p) => l10n.sessionToolShell(p['command']),
  'sessions.tool.shellOutput': (AppLocalizations l10n, _Params p) => l10n.sessionToolShellOutput,
  'sessions.tool.search': (AppLocalizations l10n, _Params p) =>
      l10n.sessionToolSearch(p['pattern']),
  'sessions.tool.searchIn': (AppLocalizations l10n, _Params p) =>
      l10n.sessionToolSearchIn(p['pattern'], p['path']),
  'sessions.tool.searchFiles': (AppLocalizations l10n, _Params p) =>
      l10n.sessionToolSearchFiles(p['pattern']),
  'sessions.tool.webFetch': (AppLocalizations l10n, _Params p) =>
      l10n.sessionToolWebFetch(p['host']),
  'sessions.tool.webSearch': (AppLocalizations l10n, _Params p) =>
      l10n.sessionToolWebSearch(p['query']),
  'sessions.tool.agent': (AppLocalizations l10n, _Params p) =>
      l10n.sessionToolAgent(p['type'], p['description']),
  'sessions.tool.question': (AppLocalizations l10n, _Params p) =>
      l10n.sessionToolQuestion(p['header']),
  'sessions.tool.questions': (AppLocalizations l10n, _Params p) =>
      l10n.sessionToolQuestions(p['count']),
  'sessions.tool.plan': (AppLocalizations l10n, _Params p) => l10n.sessionToolPlan,
  'sessions.tool.tasksWrite': (AppLocalizations l10n, _Params p) =>
      l10n.sessionToolTasksWrite(p['count']),
  'sessions.tool.taskCreate': (AppLocalizations l10n, _Params p) =>
      l10n.sessionToolTaskCreate(p['subject']),
  'sessions.tool.taskUpdate': (AppLocalizations l10n, _Params p) =>
      l10n.sessionToolTaskUpdate(p['id']),
  'sessions.tool.taskGet': (AppLocalizations l10n, _Params p) => l10n.sessionToolTaskGet(p['id']),
  'sessions.tool.taskList': (AppLocalizations l10n, _Params p) => l10n.sessionToolTaskList,
  'sessions.tool.mcp': (AppLocalizations l10n, _Params p) =>
      l10n.sessionToolMcp(p['server'], p['tool']),
};

/// The label of a call of [kind], in words: [label]'s key translated with its params; otherwise the
/// generic line — `sessions.tool.other` itself, a key this build has no words for, or a kind it does
/// not know (S-59) —, which says the name the backend gave when it gave one as text, and the kind
/// otherwise: never an error, never an empty row.
String toolLabelWords(AppLocalizations l10n, {required String kind, required ToolLabel label}) {
  final _Words? words = knownToolKinds.contains(kind) ? _labels[label.messageKey] : null;
  final Object? name = label.params['name'];

  return words?.call(l10n, _Params(label.params)) ??
      l10n.sessionToolOther(name is String && name.isNotEmpty ? name : kind);
}

/// The short name of each kind that has one — what goes before the description the model gave, and
/// what a rule is named by (plan 28, F5).
final Map<String, String Function(AppLocalizations l10n)> _kindNames =
    <String, String Function(AppLocalizations l10n)>{
      'file.read': (AppLocalizations l10n) => l10n.sessionKindFileRead,
      'file.edit': (AppLocalizations l10n) => l10n.sessionKindFileEdit,
      'file.write': (AppLocalizations l10n) => l10n.sessionKindFileWrite,
      'file.delete': (AppLocalizations l10n) => l10n.sessionKindFileDelete,
      'file.move': (AppLocalizations l10n) => l10n.sessionKindFileMove,
      'search': (AppLocalizations l10n) => l10n.sessionKindSearch,
      'shell': (AppLocalizations l10n) => l10n.sessionKindShell,
      'shell.output': (AppLocalizations l10n) => l10n.sessionKindShellOutput,
      'web.fetch': (AppLocalizations l10n) => l10n.sessionKindWebFetch,
      'web.search': (AppLocalizations l10n) => l10n.sessionKindWebSearch,
      'mcp': (AppLocalizations l10n) => l10n.sessionKindMcp,
      'agent': (AppLocalizations l10n) => l10n.sessionKindAgent,
      'question': (AppLocalizations l10n) => l10n.sessionKindQuestion,
      'plan': (AppLocalizations l10n) => l10n.sessionKindPlan,
      'tasks': (AppLocalizations l10n) => l10n.sessionKindTasks,
      'other': (AppLocalizations l10n) => l10n.sessionKindOther,
    };

/// The short name of [kind] — "Shell", "Edit" —, or `null` when it has none this build knows.
String? kindNameText(AppLocalizations l10n, String kind) => _kindNames[kind]?.call(l10n);

/// The short name of [kind], or the generic one ("Tool") for a kind this build does not know, or for
/// none — how a rule says which calls it answers, never by the engine's name for a tool (plan 28, F5).
String kindNameOrGeneric(AppLocalizations l10n, String? kind) =>
    (kind == null ? null : kindNameText(l10n, kind)) ?? l10n.sessionKindOther;

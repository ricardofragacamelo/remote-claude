/// What a permission request asks, in words: the title the backend named by the kind of the call —
/// `permission.tool.<kindKey>` —, or the call's label when this build has no words for that key
/// (plan 28, B-19).
///
/// The same keys the web translates, paired in `scripts/i18n-shared.json`. Never the engine's name for
/// the tool: the per-tool titles are gone with the names they were keyed by.
library;

import 'package:flutter/widgets.dart';
import 'package:remote_claude/core/widgets/agent_names.dart';
import 'package:remote_claude/core/widgets/tool_label_words.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// One title, in words — [agent] is the display name of the engine that asks, for the one title
/// that names it.
typedef _Title = String Function(AppLocalizations l10n, String agent);

/// Every title key the backend names, by the wire key — a table of the generated getters, so a
/// missing translation is a compile error.
final Map<String, _Title> _titles = <String, _Title>{
  'permission.tool.fileRead': (AppLocalizations l10n, String agent) => l10n.permissionToolFileRead,
  'permission.tool.fileEdit': (AppLocalizations l10n, String agent) => l10n.permissionToolFileEdit,
  'permission.tool.fileWrite': (AppLocalizations l10n, String agent) =>
      l10n.permissionToolFileWrite,
  'permission.tool.fileDelete': (AppLocalizations l10n, String agent) =>
      l10n.permissionToolFileDelete,
  'permission.tool.fileMove': (AppLocalizations l10n, String agent) => l10n.permissionToolFileMove,
  'permission.tool.search': (AppLocalizations l10n, String agent) => l10n.permissionToolSearch,
  'permission.tool.shell': (AppLocalizations l10n, String agent) => l10n.permissionToolShell,
  'permission.tool.shellOutput': (AppLocalizations l10n, String agent) =>
      l10n.permissionToolShellOutput,
  'permission.tool.webFetch': (AppLocalizations l10n, String agent) => l10n.permissionToolWebFetch,
  'permission.tool.webSearch': (AppLocalizations l10n, String agent) =>
      l10n.permissionToolWebSearch,
  'permission.tool.mcp': (AppLocalizations l10n, String agent) => l10n.permissionToolMcp,
  'permission.tool.agent': (AppLocalizations l10n, String agent) => l10n.permissionToolAgent,
  'permission.tool.question': (AppLocalizations l10n, String agent) =>
      l10n.permissionToolQuestion(agent),
  'permission.tool.plan': (AppLocalizations l10n, String agent) => l10n.permissionToolPlan,
  'permission.tool.tasks': (AppLocalizations l10n, String agent) => l10n.permissionToolTasks,
  'permission.tool.other': (AppLocalizations l10n, String agent) => l10n.permissionToolOther,
};

/// What [request] asks, with [agent] as the name of the engine that asks it.
String permissionTitleText(AppLocalizations l10n, PermissionRequest request, {String agent = ''}) =>
    _titles[request.titleKey]?.call(l10n, agent) ??
    toolLabelWords(l10n, kind: request.call.kind, label: request.call.label);

/// What [request] asks, naming the engine by the names above [context] — and, when it is a
/// subagent's own tool, naming the subagent too (plan 26, B-21): "Subagent {type} — {title}", the
/// subagent's type the same word its own card is titled by (`sessions.tool.agent`'s own `type`).
String permissionTitleOf(BuildContext context, PermissionRequest request, {String? subagent}) {
  final AppLocalizations l10n = AppLocalizations.of(context);
  final String title = permissionTitleText(
    l10n,
    request,
    agent: AgentNamesScope.of(context).nameOf(request.engine),
  );

  return subagent == null ? title : l10n.permissionSubagentTitle(subagent, title);
}

/// The title of a question of the agent — a request that carries questions —, naming the engine
/// that asks by the names above [context].
String questionTitleOf(BuildContext context, PermissionRequest request) => AppLocalizations.of(
  context,
).permissionToolQuestion(AgentNamesScope.of(context).nameOf(request.engine));

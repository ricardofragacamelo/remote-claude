/// What the row of a tool call says: the label the backend built, in words — and, when the model
/// described the call, the short name of its kind with that description (plan 28, B-19).
///
/// The same rules the web draws by, from the paired keys of `scripts/i18n-shared.json` (S-58):
///
/// - no description: the translated label — "Shell: npm test";
/// - a description, on any kind but `agent` — whose label already says what it was sent to do —:
///   `{name} · {title}`, where the name is the short name of the kind ("Shell · Run the tests"), or
///   the translated label for `mcp`, `other` and any kind this build does not know, whose short name
///   would say nothing;
/// - a key or a kind this build does not know: the generic line (S-59).
///
/// Never the engine's own name for the tool, which this build does not read.
library;

import 'package:remote_claude/core/conversation/tool_call.dart';
import 'package:remote_claude/core/widgets/tool_label_words.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The kinds whose row keeps its label before the description: the short name of an MCP tool or of
/// a generic one would hide which tool it is.
const Set<String> _labelledKinds = <String>{'mcp', 'other'};

/// What the row of a call of [kind] with [label] says, with the description [title] the model gave
/// it, when it gave one.
String toolLabelText(
  AppLocalizations l10n, {
  required String kind,
  required ToolLabel label,
  String? title,
}) {
  final String words = toolLabelWords(l10n, kind: kind, label: label);

  if (title == null || kind == 'agent') {
    return words;
  }

  final String? short = _labelledKinds.contains(kind) ? null : kindNameText(l10n, kind);

  return l10n.sessionToolTitled(short ?? words, title);
}

/// What the row of [call] says, with [title].
String toolCallText(AppLocalizations l10n, ToolCall call, {String? title}) =>
    toolLabelText(l10n, kind: call.kind, label: call.label, title: title);

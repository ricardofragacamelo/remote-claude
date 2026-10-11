/// How the screens name an engine: by the `displayName` the backend gives it, never by a word of
/// the app's own.
///
/// The core never says the name of an engine (ADR-025). Where a sentence needs it, the name enters
/// as its `{agent}`, read from `GET /engines` — and that list is the session feature's, which `core/`
/// may not import. So the names travel down the tree instead: the app puts them above every screen,
/// and any widget — a core one included — reads them from its context
/// (docs/architecture/shared/12-engines.md).
library;

import 'package:equatable/equatable.dart';
import 'package:flutter/widgets.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The display names of the engines the app knows, by their id.
class AgentNames extends Equatable {
  const AgentNames({this.names = const <String, String>{}, this.defaultEngine});

  /// None known yet — before the list arrived, or with nobody signed in.
  static const AgentNames none = AgentNames();

  /// Each engine's display name, by its id.
  final Map<String, String> names;

  /// The engine a session opens on when nobody names one.
  final String? defaultEngine;

  /// How a sentence names [engine]: its display name; the id itself when the list does not know it —
  /// never an empty gap in the sentence —; and, when nothing named one, the default engine's.
  String nameOf(String? engine) {
    final String? known = engine == null || engine.isEmpty ? defaultEngine : engine;

    return known == null ? '' : names[known] ?? known;
  }

  /// [nameOf] as a sentence of [l10n] says it: the word for any agent while no name is known —
  /// signed out, or before the list arrived —, so the sentence never reads with a gap.
  String said(AppLocalizations l10n, [String? engine]) {
    final String name = nameOf(engine);

    return name.isEmpty ? l10n.engineNameFallback : name;
  }

  @override
  List<Object?> get props => <Object?>[names, defaultEngine];
}

/// Puts [names] above [child], for every widget below to read with [AgentNamesScope.of].
class AgentNamesScope extends InheritedWidget {
  const AgentNamesScope({required this.names, required super.child, super.key});

  final AgentNames names;

  /// The names above [context] — [AgentNames.none] when nothing put any there.
  static AgentNames of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AgentNamesScope>()?.names ?? AgentNames.none;

  @override
  bool updateShouldNotify(AgentNamesScope oldWidget) => names != oldWidget.names;
}

/// How a sentence below [context] names [engine] — the `{agent}` of a text of the core: by the names
/// [AgentNamesScope] holds, the default engine's when [engine] is `null` ([AgentNames.said]).
String agentNameIn(BuildContext context, [String? engine]) =>
    AgentNamesScope.of(context).said(AppLocalizations.of(context), engine);

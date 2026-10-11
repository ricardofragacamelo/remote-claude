/// The plan the agent presents before it changes anything, to approve or to send back (plan 28,
/// B-20) — the `plan` variant of a request's `interaction`, normalised by the adapter of the engine.
///
/// Pure value: the card draws [markdown] and never reads the call's exact input.
library;

import 'package:equatable/equatable.dart';

/// One plan to approve.
class PlanInteraction extends Equatable {
  const PlanInteraction({required this.markdown, this.path});

  /// The plan, in markdown — text to show, never markup to trust.
  final String markdown;

  /// The file the agent saved it to, when it said.
  final String? path;

  @override
  List<Object?> get props => <Object?>[markdown, path];
}

/// The plan of a request's `interaction`, or `null` when the interaction is not a plan — or is one
/// without its text: a plan nobody can read is not one to approve, and the request falls back to the
/// generic card.
PlanInteraction? planInteractionFrom(Object? value) {
  if (value is! Map<String, Object?> || value['kind'] != 'plan') {
    return null;
  }

  final Object? markdown = value['markdown'];
  final Object? path = value['path'];

  return markdown is String
      ? PlanInteraction(markdown: markdown, path: path is String && path.isNotEmpty ? path : null)
      : null;
}

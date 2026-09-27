/// A conversation of Claude's store, as the history of one workspace lists it.
///
/// Pure Dart. The store is shared with the editor and the terminal, so the list holds what was
/// said anywhere on the machine — inside the allowlist, and only there (04 · D-01).
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/features/transcript/domain/entities/conversation_origin.dart';

/// One conversation of the list.
class ConversationSummary extends Equatable {
  const ConversationSummary({
    required this.conversationId,
    required this.origin,
    required this.cwd,
    required this.lastModified,
    this.summary = '',
    this.gitBranch,
    this.createdAt,
  });

  /// The id in Claude's store — what a page of it is read by, and what a resume names.
  final String conversationId;

  /// What the store calls it. Empty when it calls it nothing.
  final String summary;

  /// Where it began, said on every row: a conversation that began elsewhere showing up is a
  /// feature, and without the label it would look like data leaking from somewhere (S-11).
  final ConversationOrigin origin;

  /// Where it ran. Opening it, and resuming it, happens there.
  final String cwd;

  final String? gitBranch;
  final DateTime? createdAt;

  /// When anything was last said in it. The list is newest first by this.
  final DateTime lastModified;

  @override
  List<Object?> get props => <Object?>[
    conversationId,
    summary,
    origin,
    cwd,
    gitBranch,
    createdAt,
    lastModified,
  ];
}

/// One page of the list.
class ConversationList extends Equatable {
  const ConversationList({this.conversations = const <ConversationSummary>[], this.nextCursor});

  /// Newest first.
  final List<ConversationSummary> conversations;

  /// Opaque: the page after this one, or `null` when this was the last.
  final String? nextCursor;

  @override
  List<Object?> get props => <Object?>[conversations, nextCursor];
}

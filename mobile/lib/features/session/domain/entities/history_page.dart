/// One page of a conversation's history, read from Claude's store.
///
/// Pure Dart. The events are the **same** [SessionEvent]s the live stream produces — history and
/// the stream go through one mapper and one fold, because two readers of the same thing is how the
/// second one falls behind (B-03).
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';

/// A page of history: the latest messages, or the ones before a cursor.
class HistoryPage extends Equatable {
  const HistoryPage({
    required this.conversationId,
    required this.workspacePath,
    this.beganElsewhere = false,
    this.summary = '',
    this.events = const <SessionEvent>[],
    this.nextCursor,
  });

  /// The conversation in Claude's store this is a page of.
  final String conversationId;

  /// Whether it began outside this product — in the editor or in the terminal; nothing says
  /// which. A resume of such a conversation continues it under a new id, and the editor will not
  /// see the answers given here: the screen has to say so before anybody resumes it (D-04).
  final bool beganElsewhere;

  /// Where it ran. A resume runs there too, and nowhere else.
  final String workspacePath;

  /// What the store calls it. Empty when it calls it nothing.
  final String summary;

  /// Oldest first, within the page. None of them has a `seq`: history is not part of any live
  /// session's numbering.
  final List<SessionEvent> events;

  /// Opaque: the page **before** this one, or `null` on the first message of the conversation.
  final String? nextCursor;

  @override
  List<Object?> get props => <Object?>[
    conversationId,
    beganElsewhere,
    workspacePath,
    summary,
    events,
    nextCursor,
  ];
}

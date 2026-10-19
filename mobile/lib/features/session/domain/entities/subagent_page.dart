/// One page of a subagent's own messages, read on demand when its card opens in the history
/// (plan 26, B-20).
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';

class SubagentPage extends Equatable {
  const SubagentPage({required this.events, this.nextCursor});

  /// The subagent's own events, oldest first — read through the same mapper the main transcript's
  /// events are, so the two can never disagree about what a message is.
  final List<SessionEvent> events;

  /// The page before this one, or `null` when this is the first message of the subagent.
  final String? nextCursor;

  @override
  List<Object?> get props => <Object?>[events, nextCursor];
}

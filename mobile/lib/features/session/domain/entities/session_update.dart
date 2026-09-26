/// Something that happened to a session's stream.
///
/// Sealed so a `switch` over it is exhaustive: an update nobody handled becomes a compile error
/// rather than an event that silently does nothing.
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';

/// One update of the stream.
sealed class SessionUpdate extends Equatable {
  const SessionUpdate();
}

/// Something happened in the session being followed.
///
/// The event travels, not the frame: the wire stops at `data/`, and both readers of this stream —
/// the conversation and the walking skeleton's round trip — work with the same domain type, so
/// they cannot go out of step about what arrived.
final class EventReceived extends SessionUpdate {
  const EventReceived(this.event);

  /// What happened.
  final SessionEvent event;

  @override
  List<Object?> get props => <Object?>[event];
}

/// The replay buffer no longer held what was missed: drop everything and reload.
final class StreamGap extends SessionUpdate {
  const StreamGap();

  @override
  List<Object?> get props => const <Object?>[];
}

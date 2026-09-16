/// Something that happened to a session's stream.
///
/// Sealed so a `switch` over it is exhaustive: an update nobody handled becomes a compile error
/// rather than an event that silently does nothing.
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/features/session/domain/entities/pong.dart';

/// One update of the stream.
sealed class SessionUpdate extends Equatable {
  const SessionUpdate();
}

/// A pong arrived.
final class PongReceived extends SessionUpdate {
  const PongReceived(this.pong);

  /// What came back.
  final Pong pong;

  @override
  List<Object?> get props => <Object?>[pong];
}

/// The replay buffer no longer held what was missed: drop everything and reload.
final class StreamGap extends SessionUpdate {
  const StreamGap();

  @override
  List<Object?> get props => const <Object?>[];
}

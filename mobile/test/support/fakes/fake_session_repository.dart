/// A session repository a test drives.
library;

import 'dart:async';

import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';

/// Emits whatever the test pushes, and records the commands it was given.
class FakeSessionRepository implements SessionRepository {
  final StreamController<SessionUpdate> _updates = StreamController<SessionUpdate>.broadcast();

  /// Nonces of the pings that were sent.
  final List<String> pings = <String>[];

  /// The session ids each ping carried.
  final List<String?> pingedSessions = <String?>[];

  /// The commands that were sent, as `(type, payload)` pairs.
  final List<(String, Map<String, Object?>)> commands = <(String, Map<String, Object?>)>[];

  /// Sessions that were followed, in order.
  final List<String> followed = <String>[];

  /// How the follower answers `lastSeq`, captured at follow time.
  int Function()? lastSeq;

  /// How many times the stream was left.
  int unfollows = 0;

  /// What [ping] answers.
  bool accepts = true;

  @override
  Stream<SessionUpdate> get updates => _updates.stream;

  @override
  void follow(String sessionId, int Function() lastSeq) {
    followed.add(sessionId);
    this.lastSeq = lastSeq;
  }

  @override
  void unfollow() => unfollows += 1;

  @override
  bool ping({String? sessionId, required String nonce}) {
    pings.add(nonce);
    pingedSessions.add(sessionId);
    return accepts;
  }

  @override
  bool send(String type, Map<String, Object?> payload) {
    commands.add((type, payload));
    return accepts;
  }

  /// Pushes one update at the controller.
  void emit(SessionUpdate update) => _updates.add(update);

  /// Closes the stream.
  Future<void> dispose() => _updates.close();
}

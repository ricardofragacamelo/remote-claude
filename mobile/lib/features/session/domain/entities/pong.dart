/// The answer to a ping, as the app's own model.
///
/// This is where the shape of the wire stops existing: everything above works with [Pong], not
/// with an `Envelope`.
library;

import 'package:equatable/equatable.dart';

/// One round trip that came back.
class Pong extends Equatable {
  const Pong({
    required this.seq,
    required this.sessionId,
    required this.pingedAt,
    required this.pingCount,
    required this.nonce,
  });

  /// Monotonic per session. It is what makes replay after a reconnect possible.
  final int seq;

  /// Session this pong belongs to.
  final String sessionId;

  /// ISO 8601 instant read from the server clock.
  final String pingedAt;

  /// How many times this session has been pinged, counting this one.
  final int pingCount;

  /// Echo of the nonce the command carried, so a client can tell its own round trip from
  /// somebody else's on the same session.
  final String nonce;

  @override
  List<Object?> get props => <Object?>[seq, sessionId, pingedAt, pingCount, nonce];
}

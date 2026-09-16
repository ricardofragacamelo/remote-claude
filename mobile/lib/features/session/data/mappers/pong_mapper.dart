/// Reads a frame as a [Pong], or answers `null` when the frame is not one.
///
/// This is the only file that knows both the wire and the entity. A DTO never leaves `data/`.
library;

import 'package:remote_claude/core/network/contracts/protocol.g.dart';
import 'package:remote_claude/features/session/domain/entities/pong.dart';

/// The pong in [frame], or `null` when [frame] is something else or is malformed.
Pong? pongFrom(Envelope frame) {
  final int? seq = frame.seq;
  final Map<String, Object?>? payload = frame.payload;

  if (frame.type != sessionPongType || seq == null || payload == null) {
    return null;
  }

  final Object? sessionId = payload['sessionId'];
  final Object? pingedAt = payload['pingedAt'];
  final Object? pingCount = payload['pingCount'];
  final Object? nonce = payload['nonce'];

  if (sessionId is! String || pingedAt is! String || pingCount is! int || nonce is! String) {
    return null;
  }

  return Pong(
    seq: seq,
    sessionId: sessionId,
    pingedAt: pingedAt,
    pingCount: pingCount,
    nonce: nonce,
  );
}

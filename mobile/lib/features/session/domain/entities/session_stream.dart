/// The live stream of one session, and the rules that keep it honest.
///
/// Two rules of the contract live here, and neither is optional:
///
/// 1. **An event with `seq <= lastSeq` is discarded.** A replay re-delivers what the client
///    already has, and without this every reconnect duplicates the tail of the transcript.
/// 2. **A gap clears everything.** When the server says the buffer no longer holds what was
///    missed, the client reloads from scratch. Stitching a partial hole produces a view that
///    looks complete and is not, which is worse than one that admits it has to reload.
///
/// The third rule of docs/architecture/mobile/03-state-and-data.md — accumulating
/// `message.delta` by `messageId` — belongs to the messaging events, which the bootstrap
/// contract does not carry yet.
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/features/session/domain/entities/pong.dart';

/// What the screen renders.
class SessionStream extends Equatable {
  const SessionStream({this.sessionId, this.lastSeq = 0, this.pongs = const <Pong>[]});

  /// Session being watched, or `null` before the first pong opened one.
  final String? sessionId;

  /// Highest `seq` applied so far. A reconnect resumes from it.
  final int lastSeq;

  /// Everything received, in arrival order.
  final List<Pong> pongs;

  /// This stream with [pong] applied, or unchanged when the contract says to drop it.
  SessionStream apply(Pong pong) {
    if (pong.seq <= lastSeq) {
      return this;
    }

    return SessionStream(
      sessionId: pong.sessionId,
      lastSeq: pong.seq,
      pongs: <Pong>[...pongs, pong],
    );
  }

  /// An empty stream, which is what a replay gap calls for.
  SessionStream cleared() => const SessionStream();

  /// Whether a round trip with [nonce] has already come back.
  bool hasNonce(String nonce) => pongs.any((Pong pong) => pong.nonce == nonce);

  @override
  List<Object?> get props => <Object?>[sessionId, lastSeq, pongs];
}

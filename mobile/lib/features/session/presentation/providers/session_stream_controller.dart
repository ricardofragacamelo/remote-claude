/// What the round-trip screen renders, and the one thing it can do.
///
/// The controller is the only layer that knows both sides: the widget above, the use cases
/// below. The widget never learns that a socket exists, and the socket never learns that a
/// widget does.
library;

import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/network/trace_provider.dart';
import 'package:remote_claude/features/session/domain/entities/pong.dart';
import 'package:remote_claude/features/session/domain/entities/session_stream.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/domain/usecases/watch_session.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'session_stream_controller.g.dart';

/// The screen's state.
class SessionScreenState extends Equatable {
  const SessionScreenState({this.stream = const SessionStream(), this.pendingNonce});

  /// Everything received so far.
  final SessionStream stream;

  /// The nonce of the round trip in flight, if there is one.
  final String? pendingNonce;

  /// Whether a round trip is still waiting for its answer.
  ///
  /// Derived rather than kept in step by an effect: the answer arriving is what ends the wait,
  /// with nothing in between that could disagree.
  bool get isSending {
    final String? nonce = pendingNonce;
    return nonce != null && !stream.hasNonce(nonce);
  }

  /// A copy with some fields replaced.
  SessionScreenState copyWith({SessionStream? stream, String? pendingNonce}) => SessionScreenState(
    stream: stream ?? this.stream,
    pendingNonce: pendingNonce ?? this.pendingNonce,
  );

  /// A copy with no round trip in flight.
  SessionScreenState withoutPending() => SessionScreenState(stream: stream);

  @override
  List<Object?> get props => <Object?>[stream, pendingNonce];
}

/// The live stream of the session on screen.
@riverpod
class SessionStreamController extends _$SessionStreamController {
  @override
  SessionScreenState build() {
    final WatchSession watch = ref.watch(watchSessionProvider);
    final StreamSubscription<SessionUpdate> subscription = watch().listen(_apply);

    // The unfollow is mandatory: without it, moving between sessions piles up subscriptions and
    // the screen starts receiving events for a session it no longer shows.
    ref.onDispose(() {
      unawaited(subscription.cancel());
      watch.unfollow();
    });

    return const SessionScreenState();
  }

  /// Sends a ping.
  ///
  /// A second tap while the first is in flight sends one command, not two: the button is
  /// disabled while `isSending` holds, and a command the socket refused never starts the wait.
  void ping() {
    final String nonce = ref.read(traceIdsProvider).next();
    final bool sent = ref.read(pingSessionProvider)(
      sessionId: state.stream.sessionId,
      nonce: nonce,
    );

    state = sent ? state.copyWith(pendingNonce: nonce) : state.withoutPending();
  }

  void _apply(SessionUpdate update) {
    switch (update) {
      case PongReceived(:final Pong pong):
        final String? before = state.stream.sessionId;
        final SessionStream next = state.stream.apply(pong);

        // The first pong is what opens the session, so following it can only start here.
        if (before == null && next.sessionId != null) {
          // The notifier's own state is the resume point. Reading it back through the provider
          // would be this provider depending on itself.
          ref.read(watchSessionProvider).follow(next.sessionId!, () => state.stream.lastSeq);
        }

        state = state.copyWith(stream: next);

      case StreamGap():
        state = const SessionScreenState();
    }
  }
}

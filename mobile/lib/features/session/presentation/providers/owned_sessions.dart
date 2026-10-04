/// The sessions this app opened — the ones it may end.
///
/// Only whoever opened a session may close it (docs/architecture/shared/05-websocket-protocol.md,
/// multi-client), and the server never says who that was: a screen learns it by having opened the
/// session itself — from a draft, by resuming one that ended, or by forking from a prompt. The web
/// keeps the same list for the same reason (plan 09, D-10).
library;

import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'owned_sessions.g.dart';

/// The ids of the sessions opened here, for as long as the app runs.
@Riverpod(keepAlive: true)
class OwnedSessions extends _$OwnedSessions {
  @override
  Set<String> build() => const <String>{};

  /// [sessionId] was opened here.
  void claim(String sessionId) {
    if (!state.contains(sessionId)) {
      state = <String>{...state, sessionId};
    }
  }
}

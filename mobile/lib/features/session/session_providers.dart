/// Wiring of the session feature: its composition root.
///
/// Same reason as the auth feature's — see `auth_providers.dart`.
library;

import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/session/data/datasources/session_ws_data_source.dart';
import 'package:remote_claude/features/session/data/repositories/session_repository_impl.dart';
import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';
import 'package:remote_claude/features/session/domain/usecases/ping_session.dart';
import 'package:remote_claude/features/session/domain/usecases/watch_session.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'session_providers.g.dart';

/// The session's edge of the socket.
@Riverpod(keepAlive: true)
SessionWsDataSource sessionWsDataSource(Ref ref) {
  final SessionWsDataSource source = SessionWsDataSource(ref.watch(wsClientProvider));
  ref.onDispose(source.dispose);
  return source;
}

/// The session repository.
@Riverpod(keepAlive: true)
SessionRepository sessionRepository(Ref ref) =>
    SessionRepositoryImpl(ref.watch(sessionWsDataSourceProvider));

/// Watches a session's stream.
@Riverpod(keepAlive: true)
WatchSession watchSession(Ref ref) => WatchSession(ref.watch(sessionRepositoryProvider));

/// Sends the one command of the walking skeleton.
@Riverpod(keepAlive: true)
PingSession pingSession(Ref ref) => PingSession(ref.watch(sessionRepositoryProvider));

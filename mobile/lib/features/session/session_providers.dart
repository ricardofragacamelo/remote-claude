/// Wiring of the session feature: its composition root.
///
/// Same reason as the auth feature's — see `auth_providers.dart`.
library;

import 'package:remote_claude/core/network/api_client_provider.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/session/data/datasources/history_api_data_source.dart';
import 'package:remote_claude/features/session/data/datasources/session_api_data_source.dart';
import 'package:remote_claude/features/session/data/datasources/session_ws_data_source.dart';
import 'package:remote_claude/features/session/data/repositories/checkpoint_repository_impl.dart';
import 'package:remote_claude/features/session/data/repositories/command_repository_impl.dart';
import 'package:remote_claude/features/session/data/repositories/history_repository_impl.dart';
import 'package:remote_claude/features/session/data/repositories/session_repository_impl.dart';
import 'package:remote_claude/features/session/domain/repositories/checkpoint_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/command_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/history_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';
import 'package:remote_claude/features/session/domain/usecases/drive_session.dart';
import 'package:remote_claude/features/session/domain/usecases/list_checkpoints.dart';
import 'package:remote_claude/features/session/domain/usecases/list_commands.dart';
import 'package:remote_claude/features/session/domain/usecases/ping_session.dart';
import 'package:remote_claude/features/session/domain/usecases/read_history.dart';
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

/// Drives a session: start, prompt, interrupt and close.
@Riverpod(keepAlive: true)
DriveSession driveSession(Ref ref) => DriveSession(ref.watch(sessionRepositoryProvider));

/// The history's edge of the backend.
@Riverpod(keepAlive: true)
HistoryApiDataSource historyApiDataSource(Ref ref) =>
    HttpHistoryApiDataSource(ref.watch(apiClientProvider));

/// The history repository.
@Riverpod(keepAlive: true)
HistoryRepository historyRepository(Ref ref) =>
    HistoryRepositoryImpl(ref.watch(historyApiDataSourceProvider));

/// Reads a page of a conversation's history.
@Riverpod(keepAlive: true)
ReadHistory readHistory(Ref ref) => ReadHistory(ref.watch(historyRepositoryProvider));

/// The endpoints of a live session that answer a question: its commands and its undo points.
@Riverpod(keepAlive: true)
SessionApiDataSource sessionApiDataSource(Ref ref) =>
    HttpSessionApiDataSource(ref.watch(apiClientProvider));

/// The command repository.
@Riverpod(keepAlive: true)
CommandRepository commandRepository(Ref ref) =>
    CommandRepositoryImpl(ref.watch(sessionApiDataSourceProvider));

/// Reads the commands of a session's installation.
@Riverpod(keepAlive: true)
ListCommands listCommands(Ref ref) => ListCommands(ref.watch(commandRepositoryProvider));

/// The checkpoint repository.
@Riverpod(keepAlive: true)
CheckpointRepository checkpointRepository(Ref ref) =>
    CheckpointRepositoryImpl(ref.watch(sessionApiDataSourceProvider));

/// Reads the undo points of a session.
@Riverpod(keepAlive: true)
ListCheckpoints listCheckpoints(Ref ref) =>
    ListCheckpoints(ref.watch(checkpointRepositoryProvider));

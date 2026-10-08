/// Wiring of the session feature: its composition root.
///
/// Same reason as the auth feature's — see `auth_providers.dart`.
library;

import 'dart:async';

import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/network/api_client_provider.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/session/data/datasources/history_api_data_source.dart';
import 'package:remote_claude/features/session/data/datasources/session_api_data_source.dart';
import 'package:remote_claude/features/session/data/datasources/session_ws_data_source.dart';
import 'package:remote_claude/features/session/data/datasources/transcript_content_api_data_source.dart';
import 'package:remote_claude/features/session/data/datasources/transcript_follow_ws_data_source.dart';
import 'package:remote_claude/features/session/data/repositories/checkpoint_repository_impl.dart';
import 'package:remote_claude/features/session/data/repositories/command_repository_impl.dart';
import 'package:remote_claude/features/session/data/repositories/history_repository_impl.dart';
import 'package:remote_claude/features/session/data/repositories/insight_repository_impl.dart';
import 'package:remote_claude/features/session/data/repositories/live_session_repository_impl.dart';
import 'package:remote_claude/features/session/data/repositories/session_repository_impl.dart';
import 'package:remote_claude/features/session/data/repositories/transcript_content_repository_impl.dart';
import 'package:remote_claude/features/session/data/repositories/transcript_follow_repository_impl.dart';
import 'package:remote_claude/features/session/domain/repositories/checkpoint_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/command_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/history_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/insight_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/live_session_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/transcript_content_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/transcript_follow_repository.dart';
import 'package:remote_claude/features/session/domain/usecases/drive_session.dart';
import 'package:remote_claude/features/session/domain/usecases/follow_transcript.dart';
import 'package:remote_claude/features/session/domain/usecases/list_checkpoints.dart';
import 'package:remote_claude/features/session/domain/usecases/list_commands.dart';
import 'package:remote_claude/features/session/domain/usecases/list_live_sessions.dart';
import 'package:remote_claude/features/session/domain/usecases/ping_session.dart';
import 'package:remote_claude/features/session/domain/usecases/read_history.dart';
import 'package:remote_claude/features/session/domain/usecases/read_insight.dart';
import 'package:remote_claude/features/session/domain/usecases/read_transcript_content.dart';
import 'package:remote_claude/features/session/domain/usecases/watch_session.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'session_providers.g.dart';

/// A source over the one socket, logging with the app's logger, and released with its provider —
/// the session's edge and the follow's are built the same way, so the way is written once.
S _overSocket<S>(
  Ref ref,
  S Function(WsClient client, AppLogger logger) create,
  Future<void> Function(S source) release,
) {
  final S source = create(ref.watch(wsClientProvider), ref.watch(appLoggerProvider));
  ref.onDispose(() => unawaited(release(source)));
  return source;
}

/// The session's edge of the socket.
@Riverpod(keepAlive: true)
SessionWsDataSource sessionWsDataSource(Ref ref) => _overSocket(
  ref,
  (WsClient client, AppLogger logger) => SessionWsDataSource(client, logger: logger),
  (SessionWsDataSource source) => source.dispose(),
);

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

/// The routes of what a conversation's timeline only marks: a tool's whole output, a prompt's
/// image (plan 22, B-32, B-33).
@Riverpod(keepAlive: true)
TranscriptContentApiDataSource transcriptContentApiDataSource(Ref ref) =>
    HttpTranscriptContentApiDataSource(ref.watch(apiClientProvider));

/// The content repository.
@Riverpod(keepAlive: true)
TranscriptContentRepository transcriptContentRepository(Ref ref) =>
    TranscriptContentRepositoryImpl(ref.watch(transcriptContentApiDataSourceProvider));

/// Opens a tool's whole output and a prompt's image.
@Riverpod(keepAlive: true)
ReadTranscriptContent readTranscriptContent(Ref ref) =>
    ReadTranscriptContent(ref.watch(transcriptContentRepositoryProvider));

/// The socket's edge for following conversations of the history (plan 22, B-24).
@Riverpod(keepAlive: true)
TranscriptFollowWsDataSource transcriptFollowWsDataSource(Ref ref) => _overSocket(
  ref,
  (WsClient client, AppLogger logger) => TranscriptFollowWsDataSource(client, logger: logger),
  (TranscriptFollowWsDataSource source) => source.dispose(),
);

/// The follow repository.
@Riverpod(keepAlive: true)
TranscriptFollowRepository transcriptFollowRepository(Ref ref) =>
    TranscriptFollowRepositoryImpl(ref.watch(transcriptFollowWsDataSourceProvider));

/// Follows a conversation of the history while another client writes it.
@Riverpod(keepAlive: true)
FollowTranscript followTranscript(Ref ref) =>
    FollowTranscript(ref.watch(transcriptFollowRepositoryProvider));

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

/// The insight repository: the catalogue, the models and the context.
@Riverpod(keepAlive: true)
InsightRepository insightRepository(Ref ref) =>
    InsightRepositoryImpl(ref.watch(sessionApiDataSourceProvider));

/// Reads the catalogue of a folder, and the models and context of a session.
@Riverpod(keepAlive: true)
ReadInsight readInsight(Ref ref) => ReadInsight(ref.watch(insightRepositoryProvider));

/// The live sessions of a folder (plan 10, F8).
@Riverpod(keepAlive: true)
LiveSessionRepository liveSessionRepository(Ref ref) =>
    LiveSessionRepositoryImpl(ref.watch(sessionApiDataSourceProvider));

/// Lists what runs in a folder.
@Riverpod(keepAlive: true)
ListLiveSessions listLiveSessions(Ref ref) =>
    ListLiveSessions(ref.watch(liveSessionRepositoryProvider));

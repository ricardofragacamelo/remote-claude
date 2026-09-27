/// Wiring of the transcript feature: its composition root.
///
/// Same reason as the auth feature's — see `auth_providers.dart`.
library;

import 'package:remote_claude/core/network/api_client_provider.dart';
import 'package:remote_claude/features/transcript/data/datasources/transcript_api_data_source.dart';
import 'package:remote_claude/features/transcript/data/repositories/transcript_repository_impl.dart';
import 'package:remote_claude/features/transcript/domain/repositories/transcript_repository.dart';
import 'package:remote_claude/features/transcript/domain/usecases/list_conversations.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'transcript_providers.g.dart';

/// The history listing's edge of the backend.
@Riverpod(keepAlive: true)
TranscriptApiDataSource transcriptApiDataSource(Ref ref) =>
    HttpTranscriptApiDataSource(ref.watch(apiClientProvider));

/// The transcript repository.
@Riverpod(keepAlive: true)
TranscriptRepository transcriptRepository(Ref ref) =>
    TranscriptRepositoryImpl(ref.watch(transcriptApiDataSourceProvider));

/// Lists the conversations of a workspace.
@Riverpod(keepAlive: true)
ListConversations listConversations(Ref ref) =>
    ListConversations(ref.watch(transcriptRepositoryProvider));

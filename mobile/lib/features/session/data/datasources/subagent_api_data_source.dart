/// The subagent endpoint of the backend.
library;

import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/core/network/conversation_wire.dart';

/// What the subagent repository needs from the backend.
abstract interface class SubagentApiDataSource {
  /// `GET /transcripts/:engine/:id/subagents/:toolUseId/messages`, the latest page or the one
  /// before [cursor]. Answers the decoded body.
  ///
  /// [workspacePath] is the folder the caller already believes the conversation runs in, when it
  /// knows one — a hint the engine uses to find a transcript too large for its own id-only lookup
  /// to resolve a folder from (S-163). Never trusted on its own; omitted, the read behaves exactly
  /// as it always did.
  Future<Object?> messages(
    ConversationKey conversation,
    String toolUseId, {
    String? cursor,
    String? workspacePath,
  });
}

/// [SubagentApiDataSource] over the one HTTP client — which logs both edges of the call, so
/// nothing here does (docs/architecture/mobile/05-logging.md).
class HttpSubagentApiDataSource implements SubagentApiDataSource {
  const HttpSubagentApiDataSource(this._api);

  final ApiClient _api;

  @override
  Future<Object?> messages(
    ConversationKey conversation,
    String toolUseId, {
    String? cursor,
    String? workspacePath,
  }) => _api.get(
    transcriptPathOf(conversation, <String>['subagents', toolUseId, 'messages']),
    query: <String, Object?>{'cursor': ?cursor, 'workspacePath': ?workspacePath},
  );
}

/// The subagent endpoint of the backend.
library;

import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/core/network/conversation_wire.dart';

/// What the subagent repository needs from the backend.
abstract interface class SubagentApiDataSource {
  /// `GET /transcripts/:engine/:id/subagents/:toolUseId/messages`, the latest page or the one
  /// before [cursor]. Answers the decoded body.
  Future<Object?> messages(ConversationKey conversation, String toolUseId, {String? cursor});
}

/// [SubagentApiDataSource] over the one HTTP client — which logs both edges of the call, so
/// nothing here does (docs/architecture/mobile/05-logging.md).
class HttpSubagentApiDataSource implements SubagentApiDataSource {
  const HttpSubagentApiDataSource(this._api);

  final ApiClient _api;

  @override
  Future<Object?> messages(ConversationKey conversation, String toolUseId, {String? cursor}) =>
      _api.get(
        transcriptPathOf(conversation, <String>['subagents', toolUseId, 'messages']),
        query: <String, Object?>{'cursor': ?cursor},
      );
}

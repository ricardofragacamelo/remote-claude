/// The history endpoint of the backend.
library;

import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/core/network/conversation_wire.dart';

/// What the history repository needs from the backend.
abstract interface class HistoryApiDataSource {
  /// `GET /transcripts/:engine/:id/messages`, the latest page or the one before [cursor]. Answers
  /// the decoded body.
  Future<Object?> messages(ConversationKey conversation, {String? cursor});
}

/// [HistoryApiDataSource] over the one HTTP client — which logs both edges of the call, so
/// nothing here does (docs/architecture/mobile/05-logging.md).
class HttpHistoryApiDataSource implements HistoryApiDataSource {
  const HttpHistoryApiDataSource(this._api);

  final ApiClient _api;

  @override
  Future<Object?> messages(ConversationKey conversation, {String? cursor}) => _api.get(
    transcriptPathOf(conversation, const <String>['messages']),
    query: <String, Object?>{'cursor': ?cursor},
  );
}

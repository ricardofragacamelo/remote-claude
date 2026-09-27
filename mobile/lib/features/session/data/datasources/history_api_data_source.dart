/// The history endpoint of the backend.
library;

import 'package:remote_claude/core/network/api_client.dart';

/// What the history repository needs from the backend.
abstract interface class HistoryApiDataSource {
  /// `GET /transcripts/:conversationId/messages`, the latest page or the one before [cursor].
  /// Answers the decoded body.
  Future<Object?> messages(String conversationId, {String? cursor});
}

/// [HistoryApiDataSource] over the one HTTP client — which logs both edges of the call, so
/// nothing here does (docs/architecture/mobile/05-logging.md).
class HttpHistoryApiDataSource implements HistoryApiDataSource {
  const HttpHistoryApiDataSource(this._api);

  final ApiClient _api;

  @override
  Future<Object?> messages(String conversationId, {String? cursor}) => _api.get(
    '/transcripts/${Uri.encodeComponent(conversationId)}/messages',
    query: <String, Object?>{'cursor': ?cursor},
  );
}

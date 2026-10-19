/// The trail endpoint of the backend.
library;

import 'package:remote_claude/core/network/api_client.dart';

/// What the repository needs from the backend.
abstract interface class AuditApiDataSource {
  /// `GET /audit-entries?sessionId=&kind=&cursor=`. Answers the decoded body.
  Future<Object?> page({required String sessionId, required String kind, String? cursor});
}

/// [AuditApiDataSource] over the one HTTP client.
class HttpAuditApiDataSource implements AuditApiDataSource {
  const HttpAuditApiDataSource(this._api);

  final ApiClient _api;

  @override
  Future<Object?> page({required String sessionId, required String kind, String? cursor}) =>
      _api.get(
        '/audit-entries',
        query: <String, Object?>{'sessionId': sessionId, 'kind': kind, 'cursor': ?cursor},
      );
}

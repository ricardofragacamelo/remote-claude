/// The permission endpoint of the backend.
library;

import 'package:remote_claude/core/network/api_client.dart';

/// What the repository needs from the backend over HTTP.
abstract interface class PermissionApiDataSource {
  /// `GET /sessions/:sessionId/permissions/:requestId`. Answers the decoded body.
  ///
  /// @throws [Failure] on any status that is not a success — including the two that are answers
  ///   for the repository to read, `404` and `410`
  Future<Object?> lookup(String sessionId, String requestId);
}

/// [PermissionApiDataSource] over the one HTTP client.
class HttpPermissionApiDataSource implements PermissionApiDataSource {
  const HttpPermissionApiDataSource(this._api);

  final ApiClient _api;

  @override
  Future<Object?> lookup(String sessionId, String requestId) => _api.get(
    '/sessions/${Uri.encodeComponent(sessionId)}/permissions/${Uri.encodeComponent(requestId)}',
  );
}

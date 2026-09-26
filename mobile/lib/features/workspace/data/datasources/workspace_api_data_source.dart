/// The workspace endpoints of the backend.
library;

import 'package:remote_claude/core/network/api_client.dart';

/// What the repository needs from the backend.
abstract interface class WorkspaceApiDataSource {
  /// `GET /workspaces`. Answers the decoded body.
  Future<Object?> list();
}

/// [WorkspaceApiDataSource] over the one HTTP client.
class HttpWorkspaceApiDataSource implements WorkspaceApiDataSource {
  const HttpWorkspaceApiDataSource(this._api);

  final ApiClient _api;

  @override
  Future<Object?> list() => _api.get('/workspaces');
}

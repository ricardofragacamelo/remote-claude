/// The workspace endpoints of the backend.
library;

import 'package:remote_claude/core/network/api_client.dart';

/// What the repository needs from the backend.
abstract interface class WorkspaceApiDataSource {
  /// `GET /workspaces`. Answers the decoded body.
  Future<Object?> list();

  /// `GET /workspaces/open-folders`.
  Future<Object?> openFolders();

  /// `POST /workspaces/open-folders` `{ path }` — `201` with the new tab, `200` with the open one.
  Future<Object?> openFolder(String path);

  /// `DELETE /workspaces/open-folders?path=`.
  Future<Object?> closeFolder(String path);

  /// `GET /workspaces/recent`.
  Future<Object?> recent();

  /// `PUT /workspaces/recent/pin` `{ path, pinned }`.
  Future<Object?> pinRecent(String path, {required bool pinned});

  /// `DELETE /workspaces/recent?path=`.
  Future<Object?> forgetRecent(String path);

  /// `GET /workspaces/directories?path=` — one level.
  Future<Object?> directories(String path);
}

/// [WorkspaceApiDataSource] over the one HTTP client.
class HttpWorkspaceApiDataSource implements WorkspaceApiDataSource {
  const HttpWorkspaceApiDataSource(this._api);

  final ApiClient _api;

  @override
  Future<Object?> list() => _api.get('/workspaces');

  // Every folder travels in the body or the query string, never in the path: a proxy that
  // normalises `%2F` would change the value the allowlist is about to check.

  @override
  Future<Object?> openFolders() => _api.get('/workspaces/open-folders');

  @override
  Future<Object?> openFolder(String path) =>
      _api.post('/workspaces/open-folders', body: <String, Object?>{'path': path});

  @override
  Future<Object?> closeFolder(String path) =>
      _api.delete('/workspaces/open-folders', query: <String, Object?>{'path': path});

  @override
  Future<Object?> recent() => _api.get('/workspaces/recent');

  @override
  Future<Object?> pinRecent(String path, {required bool pinned}) =>
      _api.put('/workspaces/recent/pin', body: <String, Object?>{'path': path, 'pinned': pinned});

  @override
  Future<Object?> forgetRecent(String path) =>
      _api.delete('/workspaces/recent', query: <String, Object?>{'path': path});

  @override
  Future<Object?> directories(String path) =>
      _api.get('/workspaces/directories', query: <String, Object?>{'path': path});
}

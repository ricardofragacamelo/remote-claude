/// The engines endpoint of the backend (plan 28, B-12).
library;

import 'package:remote_claude/core/network/api_client.dart';

/// What the engine repository needs from the backend.
abstract interface class EngineApiDataSource {
  /// `GET /engines`. Answers the decoded body.
  Future<Object?> engines();
}

/// [EngineApiDataSource] over the one HTTP client — which logs both edges of the call, so nothing
/// here does (docs/architecture/mobile/05-logging.md).
class HttpEngineApiDataSource implements EngineApiDataSource {
  const HttpEngineApiDataSource(this._api);

  final ApiClient _api;

  @override
  Future<Object?> engines() => _api.get('/engines');
}

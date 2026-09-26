/// The device endpoints of the backend.
library;

import 'package:remote_claude/core/network/api_client.dart';

/// What the repository needs from the backend.
abstract interface class DeviceApiDataSource {
  /// `POST /devices`. Answers the decoded body.
  Future<Object?> register(Map<String, Object?> body);

  /// `GET /devices`. Answers the decoded body.
  Future<Object?> list();
}

/// [DeviceApiDataSource] over the one HTTP client.
class HttpDeviceApiDataSource implements DeviceApiDataSource {
  const HttpDeviceApiDataSource(this._api);

  final ApiClient _api;

  @override
  Future<Object?> register(Map<String, Object?> body) => _api.post('/devices', body: body);

  @override
  Future<Object?> list() => _api.get('/devices');
}

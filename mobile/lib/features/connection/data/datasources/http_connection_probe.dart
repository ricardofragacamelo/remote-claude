/// The test of an address, over HTTP (plan 10, B-29): `GET <origin>/api/health`, then the discovery
/// of the issuer derived from the origin.
///
/// A client of its own, never the app's: the address under test is not the one the app talks
/// through, and the credential of the app must never travel to it — another origin is another issuer
/// (D-13). Both requests are logged in `debug`, without a token, because there is none.
library;

import 'package:dio/dio.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/features/connection/domain/entities/probe_result.dart';
import 'package:remote_claude/features/connection/domain/repositories/connection_probe.dart';

/// How long one request of the test may take before it counts as unanswered.
const Duration probeTimeout = Duration(seconds: 10);

/// [ConnectionProbe] over a client of its own.
class HttpConnectionProbe implements ConnectionProbe {
  HttpConnectionProbe({required this._logger, Dio? dio})
    : _dio = dio ?? Dio(BaseOptions(connectTimeout: probeTimeout, receiveTimeout: probeTimeout));

  final AppLogger _logger;
  final Dio _dio;

  @override
  Future<ProbeResult> probe({required String origin, required String issuer}) async {
    if (!await _answers('$origin/api/health')) {
      return ProbeResult.serverUnreachable;
    }

    return await _answers('$issuer/.well-known/openid-configuration')
        ? ProbeResult.ok
        : ProbeResult.loginUnavailable;
  }

  /// Whether [url] answers with a success.
  Future<bool> _answers(String url) async {
    _logger.debug(
      'probing an address',
      op: 'connection.probe',
      fields: <String, Object?>{'url': url},
    );

    try {
      final Response<Object?> response = await _dio.get<Object?>(url);
      final bool ok = (response.statusCode ?? 0) ~/ 100 == 2;
      _logger.debug(
        'the address answered',
        op: 'connection.probe',
        fields: <String, Object?>{'url': url, 'status': response.statusCode, 'ok': ok},
      );
      return ok;
    } on DioException catch (error) {
      _logger.debug(
        'the address did not answer',
        op: 'connection.probe',
        fields: <String, Object?>{
          'url': url,
          'status': error.response?.statusCode,
          'kind': error.type.name,
        },
      );
      return false;
    }
  }
}

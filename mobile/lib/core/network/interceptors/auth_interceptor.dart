/// Carries the credential, and renews it once when the server refuses.
///
/// No data source does this for itself. Renewing on a `401` only is already late — the proactive
/// renewal lives in the auth feature — but a token that expired between the check and the call
/// still has to be survivable without the user seeing anything.
library;

import 'package:dio/dio.dart';
import 'package:remote_claude/core/network/credentials.dart';

/// Marks a request that has already been retried, so a second `401` is not a renewal loop.
const String retriedExtra = 'rc.retried';

/// Adds `Authorization`, and retries once after renewing.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({required this._credentials, required this._dio});

  final CredentialSource _credentials;
  final Dio _dio;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final String? token = _credentials.accessToken;
    if (token != null) {
      options.headers['authorization'] = 'Bearer $token';
    }

    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final bool retried = err.requestOptions.extra[retriedExtra] == true;

    if (err.response?.statusCode != 401 || retried) {
      handler.next(err);
      return;
    }

    final String? renewed = await _credentials.renew();
    if (renewed == null) {
      handler.next(err);
      return;
    }

    final RequestOptions options = err.requestOptions
      ..extra[retriedExtra] = true
      ..headers['authorization'] = 'Bearer $renewed';

    try {
      handler.resolve(await _dio.fetch<Object?>(options));
    } on DioException catch (retryFailure) {
      handler.next(retryFailure);
    }
  }
}

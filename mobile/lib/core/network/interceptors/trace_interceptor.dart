/// Stamps the headers every request of this app carries.
///
/// It is the client's job, not each data source's: a header added in fourteen places is a header
/// missing from the fifteenth. See docs/architecture/mobile/03-state-and-data.md.
library;

import 'package:dio/dio.dart';
import 'package:remote_claude/core/network/credentials.dart';
import 'package:remote_claude/core/network/trace.dart';

/// Key under which the trace of a request travels inside Dio, so the response side can read it.
const String traceIdExtra = 'rc.traceId';

/// Adds `x-trace-id` and `Accept-Language` to every request.
class TraceInterceptor extends Interceptor {
  TraceInterceptor({required this._credentials, required this._traceIds});

  final CredentialSource _credentials;
  final TraceIds _traceIds;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final Object? existing = options.extra[traceIdExtra];
    final String traceId = existing is String ? existing : _traceIds.next();

    options.extra[traceIdExtra] = traceId;
    options.headers['x-trace-id'] = traceId;
    options.headers['accept-language'] = _credentials.locale;

    handler.next(options);
  }
}

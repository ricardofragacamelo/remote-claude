/// Logs both edges of every HTTP call, at `debug`.
///
/// Entry **and** exit: a log with only one side cannot tell a request that was never answered
/// from one that was answered wrongly. See docs/architecture/shared/03-logging.md.
library;

import 'package:dio/dio.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/network/interceptors/trace_interceptor.dart';

/// Key under which the start of a request travels, so the response can report a duration.
const String startedAtExtra = 'rc.startedAt';

/// Writes `http.request` and `http.response`.
class IoLoggingInterceptor extends Interceptor {
  IoLoggingInterceptor({required this._logger, DateTime Function()? now})
    : _now = now ?? DateTime.now;

  final AppLogger _logger;
  final DateTime Function() _now;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    options.extra[startedAtExtra] = _now().millisecondsSinceEpoch;

    _logger.debug(
      'http request',
      op: LogOp.httpRequest,
      fields: <String, Object?>{
        'method': options.method,
        'url': options.path,
        'traceId': options.extra[traceIdExtra],
      },
    );

    handler.next(options);
  }

  @override
  void onResponse(Response<Object?> response, ResponseInterceptorHandler handler) {
    _logger.debug(
      'http response',
      op: LogOp.httpResponse,
      fields: _outcome(response.requestOptions, response.statusCode),
    );

    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    _logger.warn(
      'http failed',
      op: LogOp.httpResponse,
      fields: <String, Object?>{
        ..._outcome(err.requestOptions, err.response?.statusCode),
        'err': err.type.name,
      },
    );

    handler.next(err);
  }

  Map<String, Object?> _outcome(RequestOptions options, int? status) {
    final Object? startedAt = options.extra[startedAtExtra];

    return <String, Object?>{
      'method': options.method,
      'url': options.path,
      'traceId': options.extra[traceIdExtra],
      'httpStatus': status,
      if (startedAt is int) 'durationMs': _now().millisecondsSinceEpoch - startedAt,
    };
  }
}

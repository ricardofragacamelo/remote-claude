/// Stamps the headers every request of this app carries.
///
/// It is the client's job, not each data source's: a header added in fourteen places is a header
/// missing from the fifteenth. See docs/architecture/mobile/03-state-and-data.md.
library;

import 'package:dio/dio.dart';
import 'package:remote_claude/core/device/install_id.dart';
import 'package:remote_claude/core/network/credentials.dart';
import 'package:remote_claude/core/network/trace.dart';

/// Key under which the trace of a request travels inside Dio, so the response side can read it.
const String traceIdExtra = 'rc.traceId';

/// Header naming the installation this request comes from.
///
/// A header rather than a body field, because it is a property of the caller and has to be
/// readable on a `GET` as well. A browser never sends it, and that absence is exactly what the
/// backend's approval rule reads: a device does not approve a device
/// ([D-02](../../../../../docs/plans/02-mobile-approval/decisions.md)).
const String installIdHeader = 'x-install-id';

/// Adds `x-trace-id`, `Accept-Language` and `x-install-id` to every request.
class TraceInterceptor extends Interceptor {
  TraceInterceptor({required this._credentials, required this._traceIds, this._installIds});

  final CredentialSource _credentials;
  final TraceIds _traceIds;

  /// Absent in a test that is not about the device, and on the very first call of a fresh app.
  final InstallIdSource? _installIds;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final Object? existing = options.extra[traceIdExtra];
    final String traceId = existing is String ? existing : _traceIds.next();

    options.extra[traceIdExtra] = traceId;
    options.headers['x-trace-id'] = traceId;
    options.headers['accept-language'] = _credentials.locale;

    // Absent on the very first call — the registration itself, which carries the id in its body.
    // Sending an empty header would be worse than sending none: the backend reads its presence.
    final String? installId = _installIds?.installId;
    if (installId != null && installId.isNotEmpty) {
      options.headers[installIdHeader] = installId;
    }

    handler.next(options);
  }
}

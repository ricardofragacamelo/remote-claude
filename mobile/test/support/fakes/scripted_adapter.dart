/// The backend, answering what the test set and keeping what it was asked.
///
/// Shared by every data source test: two copies of "a Dio adapter that answers a fixed body"
/// is the duplication the gate refuses, and the second copy is always the one that forgets to
/// record the request.
library;

import 'package:dio/dio.dart';

/// An adapter whose answer the test chooses.
class ScriptedAdapter implements HttpClientAdapter {
  /// The status to answer with.
  int status = 200;

  /// The body to answer with, as it would arrive on the wire.
  String body = '{}';

  /// A status of its own for a path, over [status] — what an endpoint that answers differently
  /// from the others looks like.
  final Map<String, int> statusByPath = <String, int>{};

  /// The paths nothing answers at: the request fails as a connection that could not be made.
  final Set<String> unreachable = <String>{};

  /// Every request that was made, in order.
  final List<RequestOptions> requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);

    if (unreachable.contains(options.uri.path)) {
      throw DioException.connectionError(requestOptions: options, reason: 'nothing answered');
    }

    return ResponseBody.fromString(
      body,
      statusByPath[options.uri.path] ?? status,
      headers: <String, List<String>>{
        Headers.contentTypeHeader: <String>[Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

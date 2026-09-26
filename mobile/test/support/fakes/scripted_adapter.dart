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

  /// Every request that was made, in order.
  final List<RequestOptions> requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);

    return ResponseBody.fromString(
      body,
      status,
      headers: <String, List<String>>{
        Headers.contentTypeHeader: <String>[Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

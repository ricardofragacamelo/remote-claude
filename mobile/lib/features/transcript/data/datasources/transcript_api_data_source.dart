/// The listing endpoint of the history.
library;

import 'package:remote_claude/core/network/api_client.dart';

/// What the transcript repository needs from the backend.
abstract interface class TranscriptApiDataSource {
  /// `GET /transcripts?workspacePath=…`, the first page or the one [cursor] names. Answers the
  /// decoded body.
  Future<Object?> list(String workspacePath, {String? cursor});
}

/// [TranscriptApiDataSource] over the one HTTP client — which logs both edges of the call, so
/// nothing here does (docs/architecture/mobile/05-logging.md).
class HttpTranscriptApiDataSource implements TranscriptApiDataSource {
  const HttpTranscriptApiDataSource(this._api);

  final ApiClient _api;

  @override
  Future<Object?> list(String workspacePath, {String? cursor}) => _api.get(
    '/transcripts',
    query: <String, Object?>{'workspacePath': workspacePath, 'cursor': ?cursor},
  );
}

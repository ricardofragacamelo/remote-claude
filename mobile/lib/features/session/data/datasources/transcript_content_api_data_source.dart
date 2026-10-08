/// The routes of the backend that serve what a conversation's timeline only marks (plan 22, B-11,
/// B-12).
library;

import 'package:remote_claude/core/network/api_client.dart';

/// What the content repository needs from the backend.
abstract interface class TranscriptContentApiDataSource {
  /// `GET /transcripts/:conversationId/tools/:toolUseId/result`. Answers the decoded body.
  Future<Object?> toolResult(String conversationId, String toolUseId);

  /// `GET /transcripts/:conversationId/images/:blockId`. Answers the bytes and their type.
  Future<ByteAnswer> promptImage(String conversationId, String blockId);
}

/// [TranscriptContentApiDataSource] over the one HTTP client — which logs both edges of the call,
/// and never a body: the output of a tool and the image of a prompt are the person's content
/// (docs/architecture/mobile/05-logging.md).
class HttpTranscriptContentApiDataSource implements TranscriptContentApiDataSource {
  const HttpTranscriptContentApiDataSource(this._api);

  final ApiClient _api;

  @override
  Future<Object?> toolResult(String conversationId, String toolUseId) =>
      _api.get(_path(conversationId, <String>['tools', toolUseId, 'result']));

  @override
  Future<ByteAnswer> promptImage(String conversationId, String blockId) =>
      _api.bytes(_path(conversationId, <String>['images', blockId]));

  /// The path of a conversation's content, every id a segment of its own — escaped, so a character
  /// that would split it cannot. The credential is the client's header, never part of this.
  static String _path(String conversationId, List<String> rest) => <String>[
    '/transcripts',
    for (final String part in <String>[conversationId, ...rest]) Uri.encodeComponent(part),
  ].join('/');
}

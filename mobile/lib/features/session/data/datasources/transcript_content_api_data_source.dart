/// The routes of the backend that serve what a conversation's timeline only marks (plan 22, B-11,
/// B-12) — under the conversation's engine and id (plan 28, B-12).
library;

import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/core/network/conversation_wire.dart';

/// What the content repository needs from the backend.
abstract interface class TranscriptContentApiDataSource {
  /// `GET /transcripts/:engine/:id/tools/:toolUseId/result`. Answers the decoded body.
  Future<Object?> toolResult(ConversationKey conversation, String toolUseId);

  /// `GET /transcripts/:engine/:id/images/:blockId`. Answers the bytes and their type.
  Future<ByteAnswer> promptImage(ConversationKey conversation, String blockId);
}

/// [TranscriptContentApiDataSource] over the one HTTP client — which logs both edges of the call,
/// and never a body: the output of a tool and the image of a prompt are the person's content
/// (docs/architecture/mobile/05-logging.md). Every id is a segment of its own, escaped; the
/// credential is the client's header, never part of the path.
class HttpTranscriptContentApiDataSource implements TranscriptContentApiDataSource {
  const HttpTranscriptContentApiDataSource(this._api);

  final ApiClient _api;

  @override
  Future<Object?> toolResult(ConversationKey conversation, String toolUseId) =>
      _api.get(transcriptPathOf(conversation, <String>['tools', toolUseId, 'result']));

  @override
  Future<ByteAnswer> promptImage(ConversationKey conversation, String blockId) =>
      _api.bytes(transcriptPathOf(conversation, <String>['images', blockId]));
}

/// The endpoints of a live session that answer a question rather than stream a fact.
///
/// The command menu and the undo points are both HTTP, not socket commands: each is a question
/// with an answer, not something that happened in the session
/// (docs/architecture/shared/05-websocket-protocol.md).
library;

import 'package:remote_claude/core/network/api_client.dart';

/// What the command and checkpoint repositories need from the backend.
abstract interface class SessionApiDataSource {
  /// `GET /sessions/:sessionId/commands`. Answers the decoded body.
  Future<Object?> commands(String sessionId);

  /// `GET /sessions/:sessionId/checkpoints`. Answers the decoded body.
  Future<Object?> checkpoints(String sessionId);
}

/// [SessionApiDataSource] over the one HTTP client — which logs both edges of the call, so
/// nothing here does (docs/architecture/mobile/05-logging.md).
class HttpSessionApiDataSource implements SessionApiDataSource {
  const HttpSessionApiDataSource(this._api);

  final ApiClient _api;

  @override
  Future<Object?> commands(String sessionId) => _api.get(_of(sessionId, 'commands'));

  @override
  Future<Object?> checkpoints(String sessionId) => _api.get(_of(sessionId, 'checkpoints'));

  /// The path of one of the session's resources. The id is a path segment, so it is encoded.
  static String _of(String sessionId, String resource) =>
      '/sessions/${Uri.encodeComponent(sessionId)}/$resource';
}

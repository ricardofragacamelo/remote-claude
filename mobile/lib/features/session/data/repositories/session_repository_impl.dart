/// The session repository over the WebSocket data source.
library;

import 'package:remote_claude/features/session/data/datasources/session_ws_data_source.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';

/// [SessionRepository] backed by the socket.
class SessionRepositoryImpl implements SessionRepository {
  const SessionRepositoryImpl(this._source);

  final SessionWsDataSource _source;

  @override
  Stream<SessionUpdate> get updates => _source.updates;

  @override
  void follow(String sessionId, int Function() lastSeq) => _source.follow(sessionId, lastSeq);

  @override
  void unfollow() => _source.unfollow();

  @override
  bool ping({String? sessionId, required String nonce}) =>
      _source.ping(sessionId: sessionId, nonce: nonce);
}

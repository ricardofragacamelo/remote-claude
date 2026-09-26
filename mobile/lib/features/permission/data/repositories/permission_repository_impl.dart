/// The permission repository over the socket and the HTTP endpoint.
library;

import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/features/permission/data/datasources/permission_api_data_source.dart';
import 'package:remote_claude/features/permission/data/datasources/permission_ws_data_source.dart';
import 'package:remote_claude/features/permission/data/mappers/permission_mapper.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_lookup.dart';
import 'package:remote_claude/features/permission/domain/repositories/permission_repository.dart';

/// [PermissionRepository] backed by the socket and the backend's permission endpoint.
class PermissionRepositoryImpl implements PermissionRepository {
  const PermissionRepositoryImpl({
    required this._client,
    required this._api,
    required this._traceIds,
  });

  final WsClient _client;
  final PermissionApiDataSource _api;
  final TraceIds _traceIds;

  @override
  PermissionFeed watch(String sessionId) => SocketPermissionFeed(_client, sessionId);

  /// Asks, and reads the two refusals that are **answers** as answers.
  ///
  /// `410` is "the deadline refused it" and `404` is "the server no longer knows it": both are the
  /// ordinary outcome of a notification opened late, and each has its own sentence on screen. They
  /// stop being `Failure`s here, where the wire stops; everything else stays one.
  @override
  Future<PermissionLookup> lookup(String sessionId, String requestId) async {
    final Object? body;

    try {
      body = await _api.lookup(sessionId, requestId);
    } on Failure catch (failure) {
      switch (failure.code) {
        case 'PERMISSION_REQUEST_EXPIRED':
          return const LookupExpired();
        case 'PERMISSION_REQUEST_NOT_FOUND':
          return const LookupGone();
        default:
          rethrow;
      }
    }

    final PermissionLookup? lookup = permissionLookupFrom(body, sessionId: sessionId);

    // A body this build cannot read is not a pending request with blanks in it. Showing a card for
    // it would be offering a decision about something nobody can describe.
    if (lookup == null) {
      throw UnexpectedFailure(traceId: _traceIds.next());
    }

    return lookup;
  }
}

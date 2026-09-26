/// The permission edge of the socket.
///
/// One feed per screen looking at a session. It is a subscriber of that session beside the
/// conversation's — the socket attaches once and re-delivers to both (D-24) — and it turns frames
/// into [PermissionEvent]s and answers into frames. The socket itself, its handshake and its
/// reconnection belong to [WsClient].
library;

import 'dart:async';

import 'package:remote_claude/core/network/contracts/protocol.g.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/features/permission/data/mappers/permission_mapper.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_event.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/domain/repositories/permission_repository.dart';

/// [PermissionFeed] over the one socket.
class SocketPermissionFeed implements PermissionFeed, SessionSubscriber {
  SocketPermissionFeed(this._client, this._sessionId) {
    _detach = _client.attach(_sessionId, this);
    // An error answers a command and belongs to no session, so it arrives through the observers.
    _unobserve = _client.observe(_onUnattached);
  }

  final WsClient _client;
  final String _sessionId;
  final StreamController<PermissionEvent> _events = StreamController<PermissionEvent>.broadcast();

  /// The extensions this feed asked for, by the id of the command that asked — the one an error
  /// frame names in `correlationId`. Another screen's refusal is not this screen's.
  final Map<String, String> _extensions = <String, String>{};

  late final void Function() _detach;
  late final void Function() _unobserve;

  @override
  Stream<PermissionEvent> get events => _events.stream;

  /// Always from the beginning of what the buffer holds.
  ///
  /// A question is a `request` frame and carries no `seq`, so this feed has no position of its own
  /// to resume from; what matters to it after a reconnect is republished by the server anyway.
  @override
  int get lastSeq => 0;

  @override
  void onEvent(Envelope frame) {
    final PermissionEvent? event = permissionEventFrom(frame);
    if (event != null) {
      _emit(event);
    }
  }

  @override
  void onGap() => _emit(const PermissionFeedReset());

  @override
  bool answer({
    required String frameId,
    required String requestId,
    required PermissionDecision decision,
    required PermissionScope scope,
    String? reason,
  }) => _client.respond(PermissionFrames.resolve, <String, Object?>{
    'requestId': requestId,
    'decision': decision.name,
    'scope': scope.name,
    'reason': ?reason,
  }, correlationId: frameId);

  @override
  bool extend(String requestId) {
    final String? commandId = _client.send(PermissionFrames.extend, <String, Object?>{
      'requestId': requestId,
    });

    if (commandId != null) {
      _extensions[commandId] = requestId;
    }

    return commandId != null;
  }

  @override
  void close() {
    _detach();
    _unobserve();
    unawaited(_events.close());
  }

  void _onUnattached(Envelope frame) {
    // Only an error settles a pending extension here; anything else that names the command leaves
    // it pending, so the refusal that may still come is still recognised as this screen's.
    final String? commandId = frame.correlationId;
    if (frame.kind != 'error' || commandId == null) {
      return;
    }

    final String? requestId = _extensions.remove(commandId);
    if (requestId == null) {
      return;
    }

    final ExtensionRefusal? refusal = extensionRefusalFrom(frame);
    if (refusal != null) {
      _emit(PermissionExtensionRefused(requestId: requestId, refusal: refusal));
    }
  }

  void _emit(PermissionEvent event) {
    if (!_events.isClosed) {
      _events.add(event);
    }
  }
}

/// Reads the backend's workspace payload as entities (plan 06; plan 28, B-48).
///
/// Read by the generated types of the contract — after checking the shape first: the generated
/// readers assert their fields, which is right for a frame this app built and wrong for an answer
/// from the network (`mobile/lib/core/network/contracts/frame_codec.dart`).
///
/// This is the only file that knows both the wire and the entity. A DTO never leaves `data/`.
library;

import 'package:remote_claude/core/network/contracts/protocol.g.dart' as wire;
import 'package:remote_claude/features/workspace/domain/entities/workspace.dart';

bool _looksLikeWorkspace(Map<String, Object?> entry) =>
    entry['path'] is String &&
    entry['label'] is String &&
    (entry['lastUsedAt'] == null || entry['lastUsedAt'] is String);

Workspace _workspaceFrom(wire.Workspace body) => Workspace(
  path: body.path,
  label: body.label,
  lastUsedAt: body.lastUsedAt == null ? null : DateTime.tryParse(body.lastUsedAt!)?.toUtc(),
);

/// One workspace, or `null` when the entry is not one.
///
/// An entry the app cannot read is dropped rather than thrown over: one malformed row in a list
/// of ten should cost the person that row, not the screen.
Workspace? workspaceFrom(Object? entry) {
  if (entry is! Map<String, Object?> || !_looksLikeWorkspace(entry)) {
    return null;
  }

  return _workspaceFrom(wire.Workspace.fromJson(entry));
}

/// Every workspace in the answer, the unreadable ones dropped — one malformed row should cost the
/// person that row, not the screen.
List<Workspace> workspacesFrom(Object? payload) {
  final Object? rawList = payload is Map<String, Object?> ? payload['workspaces'] : null;

  if (rawList is! List<Object?>) {
    return const <Workspace>[];
  }

  final List<Object?> validRows = rawList
      .where((Object? entry) => entry is Map<String, Object?> && _looksLikeWorkspace(entry))
      .toList(growable: false);

  final wire.WorkspaceListPayload body = wire.WorkspaceListPayload.fromJson(<String, Object?>{
    'workspaces': validRows,
  });

  return body.workspaces.map(_workspaceFrom).toList(growable: false);
}

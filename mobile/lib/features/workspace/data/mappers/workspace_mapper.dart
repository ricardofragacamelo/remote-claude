/// Reads the backend's workspace payload as entities.
///
/// This is the only file that knows both the wire and the entity. A DTO never leaves `data/`.
library;

import 'package:remote_claude/features/workspace/domain/entities/workspace.dart';

/// One workspace, or `null` when the entry is not one.
///
/// An entry the app cannot read is dropped rather than thrown over: one malformed row in a list
/// of ten should cost the person that row, not the screen.
Workspace? workspaceFrom(Object? entry) {
  if (entry is! Map<String, Object?>) {
    return null;
  }

  final Object? path = entry['path'];
  final Object? label = entry['label'];
  final Object? lastUsedAt = entry['lastUsedAt'];

  if (path is! String || label is! String) {
    return null;
  }

  return Workspace(
    path: path,
    label: label,
    lastUsedAt: lastUsedAt is String ? DateTime.tryParse(lastUsedAt)?.toUtc() : null,
  );
}

/// Every workspace in the answer, in the order the backend gave them.
List<Workspace> workspacesFrom(Object? payload) {
  if (payload is! Map<String, Object?>) {
    return const <Workspace>[];
  }

  final Object? workspaces = payload['workspaces'];

  if (workspaces is! List<Object?>) {
    return const <Workspace>[];
  }

  return workspaces
      .map(workspaceFrom)
      .where((Workspace? workspace) => workspace != null)
      .cast<Workspace>()
      .toList(growable: false);
}

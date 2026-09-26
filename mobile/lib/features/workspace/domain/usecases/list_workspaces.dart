/// Reading the allowlist. One use case, one thing it does.
library;

import 'package:remote_claude/features/workspace/domain/entities/workspace.dart';
import 'package:remote_claude/features/workspace/domain/repositories/workspace_repository.dart';

/// The roots a session may be opened in.
class ListWorkspaces {
  const ListWorkspaces(this._workspaces);

  final WorkspaceRepository _workspaces;

  Future<List<Workspace>> call() => _workspaces.list();
}

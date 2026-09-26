/// What the workspace use cases need, stated as an interface they own.
library;

import 'package:remote_claude/features/workspace/domain/entities/workspace.dart';

/// The roots this user may open, against the backend.
abstract interface class WorkspaceRepository {
  /// Every root this caller may use. A root belonging to somebody else is not listed at all.
  ///
  /// @throws [Failure] never an exception of the transport
  Future<List<Workspace>> list();
}

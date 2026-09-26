/// A workspace repository a test drives.
library;

import 'dart:async';

import 'package:remote_claude/features/workspace/domain/entities/workspace.dart';
import 'package:remote_claude/features/workspace/domain/repositories/workspace_repository.dart';

/// Answers what the test set, and counts how often it was asked.
class FakeWorkspaceRepository implements WorkspaceRepository {
  FakeWorkspaceRepository({this.workspaces = const <Workspace>[], this.failure});

  /// What [list] answers.
  List<Workspace> workspaces;

  /// What [list] throws instead of answering, when the test wants the error state.
  Object? failure;

  /// How many times the allowlist was read.
  int reads = 0;

  /// Held open while a test wants to look at the loading state.
  ///
  /// Without it the answer is already there on the first frame, and the state every screen owes
  /// the person while it waits would never be rendered — so it would never be tested.
  Completer<void>? gate;

  @override
  Future<List<Workspace>> list() async {
    reads += 1;
    await gate?.future;

    final Object? thrown = failure;
    if (thrown != null) {
      throw thrown;
    }

    return workspaces;
  }
}

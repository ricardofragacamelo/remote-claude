/// The allowlist, as the screen has it.
library;

import 'package:remote_claude/features/workspace/domain/entities/workspace.dart';
import 'package:remote_claude/features/workspace/workspace_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'workspace_list_controller.g.dart';

/// The roots a session may be opened in.
///
/// An `AsyncNotifier` and not a plain future provider, because the screen has a retry: the four
/// states a loading screen owes the person include one they can act on, and acting on it means
/// asking again from here (docs/architecture/mobile/04-ui.md).
@riverpod
class WorkspaceListController extends _$WorkspaceListController {
  @override
  Future<List<Workspace>> build() => ref.watch(listWorkspacesProvider)();

  /// Asks again, keeping what is on screen until the answer arrives.
  Future<void> reload() async {
    state = const AsyncValue<List<Workspace>>.loading();
    state = await AsyncValue.guard<List<Workspace>>(() => ref.read(listWorkspacesProvider)());
  }
}

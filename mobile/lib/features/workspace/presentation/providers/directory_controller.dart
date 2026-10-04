/// One level of a folder, for the picker (plan 10, F7).
library;

import 'package:remote_claude/features/workspace/domain/entities/folder.dart';
import 'package:remote_claude/features/workspace/workspace_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'directory_controller.g.dart';

/// Never asked again on its own: the screen says the failure and offers its own retry and its pull
/// to refresh, and an automatic retry would hide the failure behind "loading" (S-150, S-151).
Duration? _neverRetry(int retryCount, Object error) => null;

/// The subfolders of [path] — one level, on demand, never the tree.
@Riverpod(retry: _neverRetry)
class DirectoryController extends _$DirectoryController {
  @override
  Future<DirectoryListing> build(String path) => ref.read(manageFoldersProvider).directories(path);

  /// Asks again, after a failure.
  Future<void> reload() async {
    state = const AsyncValue<DirectoryListing>.loading();
    state = await AsyncValue.guard<DirectoryListing>(
      () => ref.read(manageFoldersProvider).directories(path),
    );
  }
}

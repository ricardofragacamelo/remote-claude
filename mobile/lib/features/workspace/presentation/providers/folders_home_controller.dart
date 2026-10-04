/// The folders home: the open folders and the recent ones (plan 10, F7).
library;

import 'dart:async' as dart_async;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/workspace/domain/entities/folder.dart';
import 'package:remote_claude/features/workspace/workspace_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'folders_home_controller.g.dart';

/// Never asked again on its own: the screen says the failure and offers its own retry and its pull
/// to refresh, and an automatic retry would hide the failure behind "loading" (S-150, S-151).
Duration? _neverRetry(int retryCount, Object error) => null;

/// What the home shows: the open folders, and the recent ones that are not open.
class FoldersHome extends Equatable {
  const FoldersHome({required this.open, required this.recent});

  /// In the order of the tabs.
  final List<OpenFolderEntry> open;

  /// Pinned first; never one that is already open — it is listed above.
  final List<RecentFolder> recent;

  @override
  List<Object?> get props => <Object?>[open, recent];
}

/// The open and recent folders, kept in step with the server — which the browser shares
/// (plan 10, D-25): every change is written there and read back, never kept only here.
@Riverpod(retry: _neverRetry)
class FoldersHomeController extends _$FoldersHomeController {
  @override
  Future<FoldersHome> build() => _read();

  /// Asks again, keeping what is on screen until the answer arrives.
  Future<void> reload() async {
    state = await AsyncValue.guard<FoldersHome>(_read);
  }

  /// Closes [path]'s tab. No session of Claude ends.
  Future<Failure?> close(String path) => _change(() => ref.read(manageFoldersProvider).close(path));

  Future<Failure?> pin(String path, {required bool pinned}) =>
      _change(() => ref.read(manageFoldersProvider).pin(path, pinned: pinned));

  Future<Failure?> forget(String path) =>
      _change(() => ref.read(manageFoldersProvider).forget(path));

  Future<Failure?> _change(Future<void> Function() change) async {
    try {
      await change();
      await reload();
      return null;
    } on Failure catch (failure) {
      return failure;
    }
  }

  Future<FoldersHome> _read() async {
    final List<OpenFolderEntry> open;
    final List<RecentFolder> recent;

    try {
      (open, recent) = await (
        ref.read(manageFoldersProvider).openFolders(),
        ref.read(manageFoldersProvider).recent(),
      ).wait;
    } on dart_async.ParallelWaitError<
      (List<OpenFolderEntry>?, List<RecentFolder>?),
      (dart_async.AsyncError?, dart_async.AsyncError?)
    > catch (both) {
      // The failure itself, not the wrapper of the two reads: the screen says its words and its
      // trace (S-150).
      final dart_async.AsyncError first = (both.errors.$1 ?? both.errors.$2)!;
      Error.throwWithStackTrace(first.error, first.stackTrace);
    }
    final Set<String> opened = open.map((OpenFolderEntry folder) => folder.path).toSet();

    return FoldersHome(
      open: open,
      recent: recent
          .where((RecentFolder folder) => !opened.contains(folder.path))
          .toList(growable: false),
    );
  }
}

/// The level of the open folder the panel is on, and what the server said of it (plan 25, B-09, B-11).
library;

import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/files/domain/entities/file_entry.dart';
import 'package:remote_claude/features/files/files_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'folder_tree_controller.g.dart';

/// Where the panel of one folder stands.
class FolderTree extends Equatable {
  const FolderTree({
    this.path = '',
    this.listing,
    this.failure,
    this.loading = false,
    this.showHidden = false,
  });

  /// The level, relative to the folder — `''` is the folder itself.
  final String path;

  /// What the server listed for [path] — kept while it is read again, so a refresh never blinks.
  final FileListing? listing;

  /// Why reading [path] failed, the last time it was asked.
  final Failure? failure;

  /// [path] is being read.
  final bool loading;

  /// The hidden names are shown (S-37).
  final bool showHidden;

  @override
  List<Object?> get props => <Object?>[path, listing, failure, loading, showHidden];
}

/// The panel of one folder — **per folder** and kept alive: closed and opened again, from the
/// session or from the folder's screen, it is where it was (S-39, S-45).
@Riverpod(keepAlive: true)
class FolderTreeController extends _$FolderTreeController {
  /// How many reads were asked: an answer to anything but the last one is dropped.
  int _asked = 0;

  @override
  FolderTree build(String folder) {
    // The first read counts like any other: a level opened before it answers wins over it.
    unawaited(_fetch(++_asked, '', null));
    return const FolderTree(loading: true);
  }

  /// Goes to the level [path] — a folder of the list, a step of the breadcrumb, "..".
  Future<void> open(String path) => _read(path, keep: false);

  /// Reads the level again, keeping what is on screen until the answer comes (S-38, S-39).
  Future<void> refresh() => _read(state.path, keep: true);

  /// Shows or hides the hidden names of the level.
  void toggleHidden() => state = FolderTree(
    path: state.path,
    listing: state.listing,
    failure: state.failure,
    loading: state.loading,
    showHidden: !state.showHidden,
  );

  Future<void> _read(String path, {required bool keep}) {
    final int ask = ++_asked;
    final FileListing? shown = keep ? state.listing : null;

    state = FolderTree(path: path, listing: shown, loading: true, showHidden: state.showHidden);
    return _fetch(ask, path, shown);
  }

  /// Reads [path], and settles the state with it — unless a newer read was asked meanwhile.
  Future<void> _fetch(int ask, String path, FileListing? shown) async {
    try {
      final FileListing listing = await ref.read(listLevelProvider)(folder, path);
      if (ref.mounted && ask == _asked) {
        state = FolderTree(path: path, listing: listing, showHidden: state.showHidden);
      }
    } on Object catch (error) {
      if (ref.mounted && ask == _asked) {
        state = FolderTree(
          path: path,
          listing: shown,
          failure: asFailure(error),
          showHidden: state.showHidden,
        );
      }
    }
  }
}

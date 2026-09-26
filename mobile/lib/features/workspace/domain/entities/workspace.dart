/// A root this installation will let Claude run in.
///
/// Pure Dart: no `flutter/*`, no `dio`. The allowlist is decided on the machine running the
/// backend and is read here, never edited — a phone that could add a root would be a phone that
/// could point Claude at any directory on somebody's computer.
library;

import 'package:equatable/equatable.dart';

/// One allowed root.
class Workspace extends Equatable {
  const Workspace({required this.path, required this.label, this.lastUsedAt});

  /// Absolute path, with every symlink already resolved by the backend.
  final String path;

  /// What the person recognises in the list.
  final String label;

  /// When this user last opened something under it, or `null` when they never have.
  final DateTime? lastUsedAt;

  @override
  List<Object?> get props => <Object?>[path, label, lastUsedAt];
}

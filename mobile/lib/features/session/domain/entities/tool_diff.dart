/// The diff of one tool that wrote a file — the backend's own, never computed from the call's
/// input (plan 26, B-16): the route reads the disk, before against after, and this is its shape
/// once the file lines are something a card can draw.
library;

import 'package:equatable/equatable.dart';

/// What one line of a hunk is: present on both sides, only on the old one, or only on the new one.
enum DiffLineKind { context, added, removed }

/// One line of a hunk, numbered on whichever side it belongs to — `null` on the side it does not.
class DiffLine extends Equatable {
  const DiffLine({required this.kind, required this.text, this.oldLine, this.newLine});

  final DiffLineKind kind;

  /// Without its line break.
  final String text;

  final int? oldLine;
  final int? newLine;

  @override
  List<Object?> get props => <Object?>[kind, text, oldLine, newLine];
}

/// A run of lines the two sides share enough of to be shown together.
class DiffHunk extends Equatable {
  const DiffHunk({required this.id, required this.lines});

  final String id;
  final List<DiffLine> lines;

  @override
  List<Object?> get props => <Object?>[id, lines];
}

/// The diff of one file a call changed, as the route answered it.
class ToolDiff extends Equatable {
  const ToolDiff({required this.path, required this.hunks});

  final String path;
  final List<DiffHunk> hunks;

  /// Every line of every hunk — what the fold counts against its ceiling.
  int get lineCount => hunks.fold(0, (int sum, DiffHunk hunk) => sum + hunk.lines.length);

  @override
  List<Object?> get props => <Object?>[path, hunks];
}

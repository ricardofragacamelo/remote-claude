/// Undoing what a session wrote on disk: the points it can go back to, and what going back did.
///
/// Pure Dart. The reach of an undo is **computed by the backend** — a diff between the snapshot,
/// what the session left and what is on disk now — and this only carries it: the confirmation
/// says exactly which files go back, which stay and why, and which are already there (S-38).
/// Confirmation without the list is confirmation without information.
library;

import 'package:equatable/equatable.dart';

/// What going back does to a file that reverts.
enum RevertAction {
  /// Its content before the turn is put back.
  restore,

  /// The turn created it, so before the turn it was not there.
  delete,
}

/// Why a file the undo reaches is left as it is.
enum PreserveReason {
  /// Somebody changed it after the session did. Overwriting it would lose their work (D-06).
  modifiedOutside,

  /// Too large or unreadable to have been snapshotted.
  notRestorable,

  /// It became a link or something other than a regular file, or its folder no longer resolves.
  unsafePath,

  /// Nothing records how the session left it, so the undo will not guess.
  noBaseline,

  /// A reason added to the contract after this build shipped. The file still stays — which is
  /// the safe direction — and the screen says it does not know why.
  other,
}

/// A file that goes back, or went back.
class RevertedFile extends Equatable {
  const RevertedFile({required this.path, required this.action});

  final String path;
  final RevertAction action;

  @override
  List<Object?> get props => <Object?>[path, action];
}

/// A file that stays as it is, and why.
class PreservedFile extends Equatable {
  const PreservedFile({required this.path, required this.reason});

  final String path;
  final PreserveReason reason;

  @override
  List<Object?> get props => <Object?>[path, reason];
}

/// One point a session's files can go back to: the state **before** one of its turns.
class Checkpoint extends Equatable {
  const Checkpoint({
    required this.promptId,
    required this.at,
    this.label,
    this.toRevert = const <RevertedFile>[],
    this.toPreserve = const <PreservedFile>[],
    this.unchanged = const <String>[],
  });

  /// The turn, as the undo command names it.
  final String promptId;

  /// The prompt of the turn, or `null` when it had none.
  final String? label;

  /// When the turn began.
  final DateTime at;

  /// What would go back, **now**.
  final List<RevertedFile> toRevert;

  /// What would stay, and why.
  final List<PreservedFile> toPreserve;

  /// What is already the way it was before the turn.
  final List<String> unchanged;

  /// Whether undoing to this point would change anything. When it would not, there is nothing to
  /// confirm — and the screen says so rather than offering a button that does nothing.
  bool get canRevert => toRevert.isNotEmpty;

  /// How many files the point reaches, in any of the three ways.
  int get fileCount => toRevert.length + toPreserve.length + unchanged.length;

  @override
  List<Object?> get props => <Object?>[promptId, label, at, toRevert, toPreserve, unchanged];
}

/// What an undo did — a list, never a boolean.
class RewindOutcome extends Equatable {
  const RewindOutcome({
    required this.promptId,
    this.reverted = const <RevertedFile>[],
    this.preserved = const <PreservedFile>[],
    this.unchanged = const <String>[],
    this.failed = const <String>[],
  });

  /// The point the files went back to.
  final String promptId;

  /// Put back the way they were before the turn.
  final List<RevertedFile> reverted;

  /// Left as they are, each with the reason.
  final List<PreservedFile> preserved;

  /// Already the way they were. A second undo to the same point lands here (S-41).
  final List<String> unchanged;

  /// Tried and could not be put back. Each was left exactly as it was — never half-written.
  final List<String> failed;

  @override
  List<Object?> get props => <Object?>[promptId, reverted, preserved, unchanged, failed];
}

/// Reads the two wires of the undo — the points of `GET /sessions/:id/checkpoints` and the
/// `session.rewound` event — as the entities of the undo screen.
///
/// This is the only file that knows both those wires and the entities. Both describe files the
/// same way (a path, what going back does to it, why it stays), so both are read by the same
/// functions: the confirmation and the outcome cannot disagree about what a reason means.
///
/// Anything it cannot read makes the **whole** point or outcome unreadable, never a shorter list:
/// a confirmation that silently leaves one file out is a confirmation of something else.
library;

import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';

/// Every undo point in a `GET /sessions/:sessionId/checkpoints` body, newest first, or `null`
/// when the body is not that listing.
///
/// A point this build cannot read is dropped: it cannot say what undoing it would do, so it is not
/// one anybody can decide to confirm.
List<Checkpoint>? checkpointsIn(Object? body) {
  final Object? points = body is Map<String, Object?> ? body['checkpoints'] : null;

  if (points is! List<Object?>) {
    return null;
  }

  return <Checkpoint>[for (final Object? point in points) ?checkpointFrom(point)];
}

/// One undo point, or `null` when it is not one this build can describe in full.
Checkpoint? checkpointFrom(Object? point) {
  final String? promptId = _text(point, 'promptId');
  final String? at = _text(point, 'at');
  final DateTime? instant = at == null ? null : DateTime.tryParse(at);
  final Object? files = point is Map<String, Object?> ? point['files'] : null;

  if (promptId == null || instant == null || files is! List<Object?>) {
    return null;
  }

  final List<RevertedFile> toRevert = <RevertedFile>[];
  final List<PreservedFile> toPreserve = <PreservedFile>[];
  final List<String> unchanged = <String>[];

  for (final Object? file in files) {
    final bool read = switch (_text(file, 'outcome')) {
      'revert' => _into(toRevert, revertedFileFrom(file)),
      'preserve' => _into(toPreserve, preservedFileFrom(file)),
      'unchanged' => _into(unchanged, pathOf(file)),
      _ => false,
    };

    if (!read) {
      return null;
    }
  }

  return Checkpoint(
    promptId: promptId,
    label: _text(point, 'label'),
    at: instant,
    toRevert: toRevert,
    toPreserve: toPreserve,
    unchanged: unchanged,
  );
}

/// The outcome in a `session.rewound` payload, or `null` when any of it cannot be read.
RewindOutcome? rewindOutcomeFrom(Map<String, Object?> payload) {
  final String? promptId = _text(payload, 'promptId');
  final List<RevertedFile>? reverted = _allOf(payload['reverted'], revertedFileFrom);
  final List<PreservedFile>? preserved = _allOf(payload['preserved'], preservedFileFrom);
  final List<String>? unchanged = _allOf(payload['unchanged'], pathOf);
  final List<String>? failed = _allOf(payload['failed'], pathOf);

  if (promptId == null ||
      reverted == null ||
      preserved == null ||
      unchanged == null ||
      failed == null) {
    return null;
  }

  return RewindOutcome(
    promptId: promptId,
    reverted: reverted,
    preserved: preserved,
    unchanged: unchanged,
    failed: failed,
  );
}

/// A file that goes back — or went back — or `null` when it does not say how.
///
/// The listing says what **would** happen (`restore`, `delete`) and the event what **did**
/// (`restored`, `deleted`); both are the same two actions.
RevertedFile? revertedFileFrom(Object? file) {
  final String? path = pathOf(file);

  final RevertAction? action = switch (_text(file, 'action')) {
    'restore' || 'restored' => RevertAction.restore,
    'delete' || 'deleted' => RevertAction.delete,
    _ => null,
  };

  return path == null || action == null ? null : RevertedFile(path: path, action: action);
}

/// A file that stays, or `null` when it names no path.
///
/// A reason this build does not know still keeps the file where it is — the safe direction — and
/// is shown as a reason the app does not know rather than dropped.
PreservedFile? preservedFileFrom(Object? file) {
  final String? path = pathOf(file);

  if (path == null) {
    return null;
  }

  return PreservedFile(
    path: path,
    reason: switch (_text(file, 'reason')) {
      'modifiedOutside' => PreserveReason.modifiedOutside,
      'notRestorable' => PreserveReason.notRestorable,
      'unsafePath' => PreserveReason.unsafePath,
      'noBaseline' => PreserveReason.noBaseline,
      _ => PreserveReason.other,
    },
  );
}

/// The path of a file entry, or `null` when it has none.
String? pathOf(Object? file) => _text(file, 'path');

/// Every entry of [list] read by [read], or `null` when it is not a list or any entry is
/// unreadable.
List<T>? _allOf<T>(Object? list, T? Function(Object? entry) read) {
  if (list is! List<Object?>) {
    return null;
  }

  final List<T?> entries = list.map(read).toList(growable: false);

  return entries.contains(null) ? null : entries.whereType<T>().toList(growable: false);
}

/// Adds [value] to [into] and answers whether there was one.
bool _into<T>(List<T> into, T? value) {
  if (value == null) {
    return false;
  }

  into.add(value);
  return true;
}

/// The string at [key] of [entry], or `null` when [entry] is not a map or the value is not text.
String? _text(Object? entry, String key) {
  final Object? value = entry is Map<String, Object?> ? entry[key] : null;
  return value is String ? value : null;
}

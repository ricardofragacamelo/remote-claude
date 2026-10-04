/// The sessions open in the app, by folder (plan 10, F9, D-28).
///
/// A session enters when its screen learns which folder it runs in — however it was reached: from
/// the folder screen, born from a draft, resumed from the history, or opened by a notification. It
/// leaves only when it is closed **in the app**, which ends nothing: the session keeps running, and
/// the folder screen lists it again. While it is here its live controller is kept alive, so its
/// stream and its questions keep arriving with another session on screen.
///
/// In memory, for as long as the app runs: it never goes to the server nor to the disk (D-28).
library;

import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'open_sessions.g.dart';

/// Folder → the ids of its sessions open in the app, in the order they entered.
@Riverpod(keepAlive: true)
class OpenSessions extends _$OpenSessions {
  @override
  Map<String, List<String>> build() => const <String, List<String>>{};

  /// [sessionId], which runs in [folder], is open in the app. Entering twice is entering once.
  void open(String folder, String sessionId) {
    if (contains(sessionId)) {
      return;
    }

    state = <String, List<String>>{
      ...state,
      folder: <String>[...?state[folder], sessionId],
    };
  }

  /// [sessionId] leaves the app's list. It is **not** ended.
  void close(String sessionId) {
    state = <String, List<String>>{
      for (final MapEntry<String, List<String>> entry in state.entries)
        if (entry.value.any((String id) => id != sessionId))
          entry.key: entry.value.where((String id) => id != sessionId).toList(growable: false),
    };
  }

  /// Whether [sessionId] is open in the app.
  bool contains(String sessionId) => isOpen(state, sessionId);

  /// The sessions of [folder] open in the app, in order.
  List<String> of(String folder) => state[folder] ?? const <String>[];

  /// The folder [sessionId] was opened under, if it is open in the app.
  String? folderOf(String sessionId) {
    for (final MapEntry<String, List<String>> entry in state.entries) {
      if (entry.value.contains(sessionId)) {
        return entry.key;
      }
    }

    return null;
  }
}

/// Whether [sessionId] is in [open] — for a listener that has the map and not the notifier.
bool isOpen(Map<String, List<String>> open, String sessionId) =>
    open.values.any((List<String> ids) => ids.contains(sessionId));

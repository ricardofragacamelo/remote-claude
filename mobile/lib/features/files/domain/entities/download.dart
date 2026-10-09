/// A file of the folder, downloaded to the phone (plan 25, B-27).
library;

import 'package:remote_claude/core/error/failure.dart';

/// The bytes written so far, and the size of the whole — `null` when the server did not say.
typedef DownloadProgress = void Function(int received, int? total);

/// What a download is asked for: a file of a folder, and its size when the screen already knows it.
class DownloadRequest {
  const DownloadRequest({required this.folder, required this.path, this.size});

  final String folder;

  /// Relative to [folder].
  final String path;

  /// In bytes, when known — checked against the ceiling before anything is asked (S-127).
  final int? size;

  /// The name the "save as" suggests.
  String get name => path.split('/').last;
}

/// What the download wrote: whole, or cut short by the person.
typedef FetchedFile = ({bool complete, String? contentType});

/// Stops a download from outside — the "cancel" of its strip.
class DownloadCancel {
  final List<void Function()> _listeners = <void Function()>[];
  bool _cancelled = false;

  /// Whether [cancel] was called.
  bool get cancelled => _cancelled;

  /// Stops the download; a second call does nothing.
  void cancel() {
    if (_cancelled) {
      return;
    }
    _cancelled = true;
    for (final void Function() listener in _listeners) {
      listener();
    }
  }

  /// Calls [listener] when cancelled — at once, when it already is.
  void onCancel(void Function() listener) {
    if (_cancelled) {
      listener();
      return;
    }
    _listeners.add(listener);
  }
}

/// How a download ended.
sealed class DownloadOutcome {
  const DownloadOutcome();
}

/// Saved where the person chose.
final class Downloaded extends DownloadOutcome {
  const Downloaded();
}

/// The person cancelled — the download, or the "save as". Nothing went wrong, and nothing is said
/// as an error (S-124).
final class DownloadCancelled extends DownloadOutcome {
  const DownloadCancelled();
}

/// Larger than the server sends, known before asking (S-127).
final class DownloadTooLarge extends DownloadOutcome {
  const DownloadTooLarge(this.limit);

  /// The ceiling, in bytes.
  final int limit;
}

/// The server, or the network, refused — the [failure] says which.
final class DownloadRefused extends DownloadOutcome {
  const DownloadRefused(this.failure);

  final Failure failure;
}

/// The bytes arrived, and the system could not save them where the person chose (S-121).
final class DownloadNotSaved extends DownloadOutcome {
  const DownloadNotSaved(this.reason);

  /// The platform's own words, for the log — never shown as they are.
  final String reason;
}

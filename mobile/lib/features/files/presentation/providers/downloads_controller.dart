/// The downloads under way, each with its own progress and its own "cancel" (plan 25, B-27, B-28).
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/features/files/domain/entities/download.dart';
import 'package:remote_claude/features/files/files_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'downloads_controller.g.dart';

/// One download on its way.
class DownloadTask extends Equatable {
  const DownloadTask({required this.id, required this.name, this.received = 0, this.total});

  /// Its own number: two downloads of the same file are two tasks (S-130).
  final int id;

  /// The file's name, as the strip says it.
  final String name;

  final int received;

  /// The size of the whole — `null` until the server says it.
  final int? total;

  /// How far it went, from 0 to 1 — `null` while the size is not known.
  double? get fraction {
    final int? whole = total;
    return whole == null || whole == 0 ? null : received / whole;
  }

  DownloadTask _at(int bytes, int? size) =>
      DownloadTask(id: id, name: name, received: bytes, total: size);

  @override
  List<Object?> get props => <Object?>[id, name, received, total];
}

/// The downloads, by number. They outlive the screen they started on: closing the panel or the
/// viewer does not stop one.
@Riverpod(keepAlive: true)
class Downloads extends _$Downloads {
  final Map<int, DownloadCancel> _cancels = <int, DownloadCancel>{};
  int _next = 0;

  @override
  Map<int, DownloadTask> build() => const <int, DownloadTask>{};

  /// Downloads [request] to the end — saved, cancelled or refused — and says how it ended.
  Future<DownloadOutcome> start(DownloadRequest request) async {
    final int id = _next++;
    final DownloadCancel cancel = DownloadCancel();
    final AppLogger logger = ref.read(appLoggerProvider);
    _cancels[id] = cancel;
    state = <int, DownloadTask>{...state, id: DownloadTask(id: id, name: request.name)};
    logger.debug(
      'a download starts',
      op: 'files.download',
      fields: <String, Object?>{'download': id, 'size': request.size},
    );

    try {
      final DownloadOutcome outcome = await ref.read(downloadFileProvider)(
        request,
        cancel: cancel,
        onProgress: (int received, int? total) => _progress(id, received, total),
      );
      logger.debug(
        'a download ended',
        op: 'files.download',
        fields: <String, Object?>{'download': id, 'outcome': outcome.runtimeType.toString()},
      );
      return outcome;
    } finally {
      _cancels.remove(id);
      // The app going away takes the downloads' state with it; nothing is left to say.
      if (ref.mounted) {
        state = <int, DownloadTask>{...state}..remove(id);
      }
    }
  }

  /// Stops download [id] — what it wrote is deleted, and no "save as" opens (S-123).
  void cancel(int id) => _cancels[id]?.cancel();

  /// Moves the bar of [id] — once per hundredth, not once per piece of the body.
  void _progress(int id, int received, int? total) {
    final DownloadTask? task = ref.mounted ? state[id] : null;
    if (task == null) {
      return;
    }
    final DownloadTask next = task._at(received, total);
    final double? before = task.fraction;
    final double? after = next.fraction;
    if (before != null && after != null && (after * 100).floor() == (before * 100).floor()) {
      return;
    }
    state = <int, DownloadTask>{...state, id: next};
  }
}

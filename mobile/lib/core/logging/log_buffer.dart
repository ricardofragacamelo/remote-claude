/// Where log lines wait before they leave the phone.
///
/// Three rules, each of them from a specific failure:
///
/// - a failed shipment never breaks the app — a logger that can crash the app is worse than no
///   logger;
/// - the shipment itself is never logged, or the first failure becomes an infinite loop;
/// - `error` and `fatal` leave immediately, because the batch that matters most is the one from
///   the crash, and the operating system may kill the process before the timer fires.
///
/// See docs/architecture/mobile/05-logging.md.
library;

import 'dart:async';

/// Where a batch goes.
abstract interface class LogShipper {
  /// Sends whatever is in the batch. Throwing is allowed; it is caught and dropped.
  Future<void> send(List<String> lines);
}

/// How the buffer behaves: thirty seconds or fifty records, whichever comes first.
const Duration batchInterval = Duration(seconds: 30);

/// Records held before a flush is forced.
const int batchSize = 50;

/// Levels that do not wait for a batch.
const Set<String> immediateLevels = <String>{'error', 'fatal'};

/// Buffers serialised lines and ships them.
class LogBuffer {
  LogBuffer(this._shipper, {this.size = batchSize});

  final LogShipper _shipper;

  /// Records held before a flush is forced.
  final int size;

  final List<String> _lines = <String>[];
  Timer? _timer;

  /// How many lines are waiting.
  int get pending => _lines.length;

  /// Starts the periodic flush.
  void start({Duration interval = batchInterval}) {
    _timer ??= Timer.periodic(interval, (Timer _) => flush());
  }

  /// Stops the periodic flush. The buffer keeps whatever it holds.
  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  /// Takes one serialised line, flushing when the batch is full or the level cannot wait.
  void accept(String line, String level) {
    _lines.add(line);

    if (_lines.length >= size || immediateLevels.contains(level)) {
      flush();
    }
  }

  /// Ships whatever is buffered. Empty is a no-op.
  void flush() {
    if (_lines.isEmpty) {
      return;
    }

    final List<String> batch = List<String>.of(_lines);
    _lines.clear();

    // Dropped on purpose, and silently: logging this failure would log the failure of logging.
    unawaited(_shipper.send(batch).catchError((Object _) {}));
  }
}

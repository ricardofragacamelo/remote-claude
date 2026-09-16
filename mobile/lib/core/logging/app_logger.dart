/// The logger of the app.
///
/// Every boundary crossing goes through it, in **both** directions, at `debug`. `print()` and
/// `debugPrint()` are forbidden and the analyzer fails the build over them: they have no level,
/// no structure and no correlation. See docs/architecture/mobile/05-logging.md.
library;

import 'dart:async';

import 'package:logging/logging.dart';
import 'package:remote_claude/core/logging/json_formatter.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/log_entry.dart';

/// Where a formatted line goes once it exists.
typedef LogWriter = void Function(String line, String level);

/// The app's logger: ambient context, structured fields, one JSON line per record.
class AppLogger {
  AppLogger({
    required this.context,
    required this._writer,
    Level level = Level.FINE,
    Logger? logger,
  }) : _logger = logger ?? Logger.detached('remote_claude') {
    _logger.level = level;
    _subscription = _logger.onRecord.listen(_emit);
  }

  /// The ambient fields this logger stamps on every line.
  LogContext context;

  final LogWriter _writer;
  final Logger _logger;
  late final StreamSubscription<LogRecord> _subscription;

  /// Replaces the ambient fields — a new route, a session that opened, a user who signed in.
  void updateContext(LogContext next) {
    context = next;
  }

  /// Every I/O edge, with its payload. The level of development.
  void debug(String message, {required String op, Map<String, Object?>? fields}) =>
      _log(Level.FINE, message, op, fields);

  /// Something worth knowing happened: a sign-in, a sign-out, a session opening.
  void info(String message, {required String op, Map<String, Object?>? fields}) =>
      _log(Level.INFO, message, op, fields);

  /// An expected failure. A business rule refusing is a `warn`, never an `error`.
  void warn(String message, {required String op, Map<String, Object?>? fields}) =>
      _log(Level.WARNING, message, op, fields);

  /// Something nobody planned for.
  void error(String message, {required String op, Object? err, Map<String, Object?>? fields}) =>
      _log(Level.SEVERE, message, op, fields, err);

  /// The app is going down. A silent crash in a published app is a debt nobody pays.
  void fatal(String message, {required String op, Object? err, Map<String, Object?>? fields}) =>
      _log(Level.SHOUT, message, op, fields, err);

  /// Stops listening. A logger that outlives the app it belongs to keeps the isolate alive.
  Future<void> dispose() => _subscription.cancel();

  void _log(Level level, String message, String op, Map<String, Object?>? fields, [Object? err]) {
    _logger.log(level, LogEntry(message, <String, Object?>{'op': op, ...?fields}), err);
  }

  void _emit(LogRecord record) {
    _writer(formatRecord(record, context), levelName(record.level));
  }
}

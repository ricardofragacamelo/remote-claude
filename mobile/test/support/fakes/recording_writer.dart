/// A log writer a test can read back.
library;

import 'dart:convert';

import 'package:remote_claude/core/logging/app_logger.dart';

/// Keeps every line the logger emitted.
class RecordingWriter {
  /// The raw lines, in order.
  final List<String> lines = <String>[];

  /// The levels, aligned with [lines].
  final List<String> levels = <String>[];

  /// The writer to hand to an [AppLogger].
  LogWriter get writer => (String line, String level) {
    lines.add(line);
    levels.add(level);
  };

  /// The decoded lines.
  List<Map<String, Object?>> get records =>
      lines.map((String line) => jsonDecode(line)! as Map<String, Object?>).toList(growable: false);

  /// The last decoded line.
  Map<String, Object?> get last => records.last;

  /// Every line whose `op` is [op].
  List<Map<String, Object?>> withOp(String op) =>
      records.where((Map<String, Object?> record) => record['op'] == op).toList(growable: false);
}

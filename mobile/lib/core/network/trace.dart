/// Where a trace is born.
///
/// At the tap, on the phone — not at the backend. It travels in `x-trace-id` over HTTP and in the
/// `traceId` field of a WebSocket frame, and it is what ties what the user saw to what the server
/// did. Keep the one from the last failure and show it on the error screen: in a published app,
/// the user's report is often the only lead there is.
/// See docs/architecture/shared/03-logging.md#traceid--como-propaga.
library;

import 'dart:math';

/// Generates trace identifiers. Injectable so a test gets the same one twice.
class TraceIds {
  TraceIds({Random? random}) : _random = random ?? Random.secure();

  final Random _random;

  /// A new trace, as a version 4 UUID — the spelling the other two ends already use.
  String next() {
    final List<int> bytes = List<int>.generate(
      16,
      (int _) => _random.nextInt(256),
      growable: false,
    );

    // Version 4, variant 1: the two fields that say how the other 122 bits were chosen.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    final String hex = bytes.map((int byte) => byte.toRadixString(16).padLeft(2, '0')).join();

    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}'
        '-${hex.substring(16, 20)}-${hex.substring(20)}';
  }
}

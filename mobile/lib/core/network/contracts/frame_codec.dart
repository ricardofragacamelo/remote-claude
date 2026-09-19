/// Reads a frame without trusting it.
///
/// The generated [Envelope] asserts its required fields, which is right for a frame this app
/// built and wrong for one that arrived from the network. This is the guard: a frame missing an
/// envelope field is dropped, an unknown **extra** field is fine. Forward compatibility is not a
/// nicety here — a published app has to survive a field the server added after it shipped.
/// See docs/architecture/shared/05-websocket-protocol.md.
library;

import 'dart:convert';

import 'package:remote_claude/core/network/contracts/protocol.g.dart';

/// The envelope in [raw], or `null` when [raw] is not one.
Envelope? decodeEnvelope(String raw) {
  final Object? parsed = _tryDecode(raw);

  if (parsed is! Map<String, Object?>) {
    return null;
  }

  if (parsed['v'] is! int ||
      parsed['id'] is! String ||
      parsed['kind'] is! String ||
      parsed['type'] is! String ||
      parsed['ts'] is! String) {
    return null;
  }

  // The conditional requirements of the envelope, generated from the same `x-required-when` the
  // TypeScript guard is generated from. An event with no `seq` is dropped here: replay is built on
  // it, and a hole that nobody notices at the edge is a hole nobody can detect afterwards.
  if (!envelopeConditionalsHold(parsed)) {
    return null;
  }

  return Envelope.fromJson(parsed);
}

/// One frame as it goes on the wire.
String encodeEnvelope(Envelope frame) => jsonEncode(frame.toJson());

Object? _tryDecode(String raw) {
  try {
    return jsonDecode(raw);
  } on FormatException {
    return null;
  }
}

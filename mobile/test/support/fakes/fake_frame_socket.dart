/// A socket a test drives by hand.
library;

import 'dart:async';
import 'dart:convert';

import 'package:remote_claude/core/network/frame_socket.dart';

/// Stands in for a real connection: nothing is opened, and the test decides what arrives.
class FakeFrameSocket implements FrameSocket {
  /// Frames the client sent.
  final List<String> sent = <String>[];

  final StreamController<String> _inbound = StreamController<String>();

  @override
  int? closeCode;

  /// How the client closed, when it did.
  String? closeReason;

  @override
  Stream<String> get frames => _inbound.stream;

  @override
  void send(String frame) => sent.add(frame);

  @override
  Future<void> close([int? code, String? reason]) async {
    closeCode = code;
    closeReason = reason;
    await _inbound.close();
  }

  /// Delivers one frame to the client.
  void deliver(String frame) => _inbound.add(frame);

  /// Answers every `session.attach` the client sent so far, as the server does: an ack naming the
  /// attach it answers. Until then, a new subscriber is given no event of its session.
  void answerAttaches() {
    for (final String raw in sent) {
      final Map<String, Object?> command = jsonDecode(raw) as Map<String, Object?>;

      if (command['type'] == 'session.attach') {
        deliver(
          jsonEncode(<String, Object?>{
            'v': 1,
            'id': 'ack-${command['id']}',
            'kind': 'ack',
            'type': 'session.attached',
            'ts': '2026-09-14T12:00:00.000Z',
            'correlationId': command['id'],
            'payload': <String, Object?>{
              'sessionId': (command['payload']! as Map<String, Object?>)['sessionId'],
              'replayed': 0,
              'oldestAvailableSeq': 0,
              'gap': false,
            },
          }),
        );
      }
    }
  }

  /// Ends the connection as the server would, with [code].
  Future<void> drop(int code) async {
    closeCode = code;
    await _inbound.close();
  }
}

/// A socket a test drives by hand.
library;

import 'dart:async';

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

  /// Ends the connection as the server would, with [code].
  Future<void> drop(int code) async {
    closeCode = code;
    await _inbound.close();
  }
}

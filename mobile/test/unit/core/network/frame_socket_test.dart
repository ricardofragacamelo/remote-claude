@TestOn('vm')
library;

import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/network/frame_socket.dart';

/// A WebSocket server in this process.
///
/// The adapter is the one file that has to talk to a real socket, so its test opens one. It is
/// local, in-process and deterministic — there is no network to be flaky about.
Future<HttpServer> serveEcho({int? closeWith}) async {
  final HttpServer server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);

  unawaited(
    server.first.then((HttpRequest request) async {
      final WebSocket socket = await WebSocketTransformer.upgrade(request);

      if (closeWith != null) {
        await socket.close(closeWith, 'server closing');
        return;
      }

      socket.listen((Object? frame) => socket.add('echo:$frame'));
    }),
  );

  return server;
}

void main() {
  test('carries frames in both directions', () async {
    final HttpServer server = await serveEcho();
    addTearDown(() => server.close(force: true));

    final FrameSocket socket = ChannelFrameSocket.connect(
      Uri.parse('ws://127.0.0.1:${server.port}'),
    );

    final Future<String> first = socket.frames.first;
    socket.send('hello');

    expect(await first, 'echo:hello');
    await socket.close(1000, 'done');
  });

  test('reports the code the connection closed with', () async {
    final HttpServer server = await serveEcho(closeWith: 4401);
    addTearDown(() => server.close(force: true));

    final FrameSocket socket = ChannelFrameSocket.connect(
      Uri.parse('ws://127.0.0.1:${server.port}'),
    );

    await socket.frames.drain<void>();

    expect(socket.closeCode, 4401);
  });
}

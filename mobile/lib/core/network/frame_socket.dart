/// The narrow slice of a WebSocket this app uses.
///
/// Narrow on purpose: a test stands in for it with a few lines, and the client above it never
/// learns which package opened the connection.
library;

import 'package:web_socket_channel/web_socket_channel.dart';

/// A socket that carries text frames.
abstract interface class FrameSocket {
  /// Inbound frames. It ends when the connection closes, for whatever reason.
  Stream<String> get frames;

  /// The code the connection closed with, once it has. `null` while it is open.
  int? get closeCode;

  /// Sends one frame.
  void send(String frame);

  /// Closes the connection.
  Future<void> close([int? code, String? reason]);
}

/// How a socket is opened. Injected so a test never opens one.
typedef FrameSocketFactory = FrameSocket Function(Uri url);

/// A [FrameSocket] over `web_socket_channel`.
class ChannelFrameSocket implements FrameSocket {
  ChannelFrameSocket(this._channel);

  /// Opens a connection to [url].
  factory ChannelFrameSocket.connect(Uri url) => ChannelFrameSocket(WebSocketChannel.connect(url));

  final WebSocketChannel _channel;

  @override
  Stream<String> get frames => _channel.stream.map((Object? frame) => '$frame');

  @override
  int? get closeCode => _channel.closeCode;

  @override
  void send(String frame) => _channel.sink.add(frame);

  @override
  Future<void> close([int? code, String? reason]) => _channel.sink.close(code, reason);
}

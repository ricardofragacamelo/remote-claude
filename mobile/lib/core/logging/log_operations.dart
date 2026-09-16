/// The `op` of every I/O edge this app has.
///
/// `op` is what makes a log searchable: `op=ws.connection` answers "what happened to the socket"
/// without anybody having to guess how the message was worded that day.
library;

/// Named operations. Every boundary crossing uses one of these.
abstract final class LogOp {
  /// Leaving the app over HTTP.
  static const String httpRequest = 'http.request';

  /// Coming back over HTTP.
  static const String httpResponse = 'http.response';

  /// A frame arriving on the socket.
  static const String wsInbound = 'ws.inbound';

  /// A frame leaving on the socket.
  static const String wsOutbound = 'ws.outbound';

  /// The socket's own state: attempts, close codes, backoff.
  static const String wsConnection = 'ws.connection';

  /// Sign-in, sign-out and renewal. Never the credential itself.
  static const String authToken = 'auth.token';

  /// A transition of the Flutter application lifecycle.
  ///
  /// Specific to mobile, and it matters more than it looks: half of the socket and push bugs are
  /// explained by the lifecycle transition immediately before them.
  static const String lifecycleChanged = 'lifecycle.changed';
}

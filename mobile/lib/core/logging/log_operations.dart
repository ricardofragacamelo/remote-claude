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

  /// Registering this installation, and the approval state the backend answered with.
  ///
  /// `info`, like sign-in and sign-out, because it is the same kind of fact: something changed
  /// about what this installation is allowed to do
  /// (docs/architecture/mobile/07-auth.md#logging).
  static const String deviceRegistered = 'device.register';

  /// A permission rule taken back from this phone.
  ///
  /// `info`, like a device registration: it changes what may run on the user's machine without
  /// anybody being asked. The HTTP edge beneath it is logged in `debug` as every edge is.
  static const String permissionRuleRevoked = 'permission.rule.revoke';

  /// A notification reaching this installation, shown or silent.
  ///
  /// `debug`, like every other inbound edge: it is I/O, and it is the first thing anybody asks
  /// about when an approval did not arrive (docs/architecture/mobile/05-logging.md).
  static const String pushReceived = 'push.received';

  /// The user tapping a notification, which is what opens the deep link.
  ///
  /// `info` rather than `debug`: it is an intent of the user, and it is the start of the trail
  /// that ends in somebody authorising a command to run on their machine.
  static const String pushOpened = 'push.opened';

  /// The transport minting a token for this installation, including every rotation.
  ///
  /// Only the last six characters of the token are ever written — see [pushTokenTail].
  static const String pushToken = 'push.token';

  /// Asking the device's own lock — biometrics or PIN — before an approval, and what it answered.
  ///
  /// `debug` for the round trip, like every edge, and `warn` when the prompt could not even be
  /// shown: an approval that silently cannot happen is the failure somebody will ask about.
  static const String deviceLock = 'device.lock';

  /// A transition of the Flutter application lifecycle.
  ///
  /// Specific to mobile, and it matters more than it looks: half of the socket and push bugs are
  /// explained by the lifecycle transition immediately before them.
  static const String lifecycleChanged = 'lifecycle.changed';
}

/// How many trailing characters of a push token may be logged.
///
/// Six: enough to tell two registrations apart in a log, far too few to send a notification with.
/// A token is a credential for reaching somebody's phone, and it is on the redaction list of the
/// backend for exactly that reason (docs/architecture/shared/03-logging.md).
const int pushTokenTailLength = 6;

/// The last six characters of a push token, or `null` when there is none.
///
/// Never the whole value, not even truncated in the middle: this is the only shape of it that is
/// allowed to reach a log line (S-14).
String? pushTokenTail(String? token) {
  if (token == null || token.isEmpty) {
    return null;
  }

  return token.length <= pushTokenTailLength
      ? token
      : token.substring(token.length - pushTokenTailLength);
}

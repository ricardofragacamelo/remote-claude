/// The fields every log line of this app carries, whether or not the call site remembered them.
///
/// Same schema as the backend and the web front — see docs/architecture/shared/03-logging.md.
/// Parity is not tidiness: correlating a tap on a phone with a NestJS request and a Claude
/// subprocess only works when the three ends spell the fields the same way.
library;

import 'package:equatable/equatable.dart';

/// Ambient fields, replaced as the app moves.
class LogContext extends Equatable {
  const LogContext({
    required this.appVersion,
    required this.platform,
    this.sessionId,
    this.connectionId,
    this.route,
    this.userId,
    this.deviceId,
  });

  /// Always `mobile`. It is what separates this app's lines from the other two ends'.
  static const String service = 'mobile';

  /// Version of this build.
  final String appVersion;

  /// `android`, `iOS`, and so on.
  final String platform;

  /// Claude session the line belongs to, when it belongs to one.
  final String? sessionId;

  /// WebSocket connection the line belongs to.
  final String? connectionId;

  /// Current `go_router` location.
  final String? route;

  /// `sub` of the token. Never the e-mail.
  final String? userId;

  /// Registered device.
  final String? deviceId;

  /// A copy with some fields replaced. Passing `null` keeps the current value.
  LogContext copyWith({
    String? sessionId,
    String? connectionId,
    String? route,
    String? userId,
    String? deviceId,
  }) => LogContext(
    appVersion: appVersion,
    platform: platform,
    sessionId: sessionId ?? this.sessionId,
    connectionId: connectionId ?? this.connectionId,
    route: route ?? this.route,
    userId: userId ?? this.userId,
    deviceId: deviceId ?? this.deviceId,
  );

  /// The fields, with the absent ones left out rather than written as `null`.
  Map<String, Object?> toFields() => <String, Object?>{
    'service': service,
    'appVersion': appVersion,
    'platform': platform,
    if (sessionId != null) 'sessionId': sessionId,
    if (connectionId != null) 'connectionId': connectionId,
    if (route != null) 'route': route,
    if (userId != null) 'userId': userId,
    if (deviceId != null) 'deviceId': deviceId,
  };

  @override
  List<Object?> get props => <Object?>[
    appVersion,
    platform,
    sessionId,
    connectionId,
    route,
    userId,
    deviceId,
  ];
}

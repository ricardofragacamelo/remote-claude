/// A notification transport a test drives.
library;

import 'dart:async';

import 'package:remote_claude/core/notifications/push_gateway.dart';

/// Answers what the test set, and records what it was asked to do.
class FakePushGateway implements PushGateway {
  final StreamController<String> _tokens = StreamController<String>.broadcast();
  final StreamController<PushArrival> _arrivals = StreamController<PushArrival>.broadcast();
  final StreamController<PushArrival> _openings = StreamController<PushArrival>.broadcast();

  /// What [permission] answers.
  PushPermission current = PushPermission.notAsked;

  /// What [request] answers, and moves [current] to.
  PushPermission answersRequest = PushPermission.granted;

  /// What [token] answers.
  String? currentToken = 'token-abcdef';

  /// How many times the operating system was actually asked.
  int requests = 0;

  /// The tags that were withdrawn, in order.
  final List<String> withdrawn = <String>[];

  /// How many times the settings screen was opened.
  int settingsOpened = 0;

  @override
  Future<PushPermission> permission() async => current;

  @override
  Future<PushPermission> request() async {
    requests += 1;
    current = answersRequest;
    return current;
  }

  @override
  Future<String?> token() async => currentToken;

  @override
  Stream<String> get tokens => _tokens.stream;

  @override
  Stream<PushArrival> get arrivals => _arrivals.stream;

  @override
  Stream<PushArrival> get openings => _openings.stream;

  @override
  Future<void> withdraw(String requestId) async => withdrawn.add(requestId);

  @override
  Future<void> openSettings() async => settingsOpened += 1;

  /// Hands over a rotated token.
  void rotate(String token) => _tokens.add(token);

  /// Delivers a notification.
  void deliver(PushArrival arrival) => _arrivals.add(arrival);

  /// Delivers a tap.
  void open(PushArrival arrival) => _openings.add(arrival);

  /// Closes every stream.
  Future<void> dispose() async {
    await _tokens.close();
    await _arrivals.close();
    await _openings.close();
  }
}

/// One arrival, with everything but what the test cares about filled in.
PushArrival anArrival({
  String sessionId = 'session-1',
  String requestId = 'request-1',
  bool isWithdrawal = false,
}) => PushArrival(
  sessionId: sessionId,
  requestId: requestId,
  expiresAt: DateTime.utc(2026, 9, 20, 12),
  isWithdrawal: isWithdrawal,
);

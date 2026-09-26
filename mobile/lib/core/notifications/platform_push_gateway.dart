/// The platform's end of [PushGateway], over a method channel.
///
/// The channel is named after the product, never after the supplier, and that is the whole point
/// of it: everything specific to who delivers the notification is on the other side, in
/// `android/`, where a library and a credential file are ordinary platform concerns (D-21).
///
/// A build with no transport wired answers `unavailable` to everything and streams nothing. That
/// is a **state of the product**, not a failure: the app still works with its socket open, and
/// the UI says so in its own words rather than borrowing the ones meant for a user who refused.
library;

import 'dart:async';

import 'package:flutter/services.dart';
import 'package:remote_claude/core/notifications/push_gateway.dart';

/// The method channel both ends agree on.
const MethodChannel pushChannel = MethodChannel('remote_claude/push');

/// The event channel the platform pushes tokens, arrivals and taps through.
const EventChannel pushEventChannel = EventChannel('remote_claude/push/events');

/// How the platform labels each thing it streams.
abstract final class PushEventKind {
  /// The transport minted a token.
  static const String token = 'token';

  /// A notification reached the device.
  static const String arrival = 'arrival';

  /// The user tapped one.
  static const String opening = 'opening';
}

/// What the payload calls a withdrawal.
const String withdrawalKind = 'permissionResolved';

/// Reads an arrival out of what the platform sent, or `null` when it is not one.
///
/// Defensive on purpose. This data crossed a third party's server and an operating system before
/// reaching here, and a client that throws on a field it did not expect is a client that dies in
/// the background where nobody can see the stack.
PushArrival? arrivalFrom(Map<Object?, Object?> data) {
  final Object? sessionId = data['sessionId'];
  final Object? requestId = data['requestId'];
  final Object? expiresAt = data['expiresAt'];

  if (sessionId is! String || requestId is! String || expiresAt is! String) {
    return null;
  }

  final DateTime? deadline = DateTime.tryParse(expiresAt);
  if (deadline == null) {
    return null;
  }

  return PushArrival(
    sessionId: sessionId,
    requestId: requestId,
    expiresAt: deadline.toUtc(),
    isWithdrawal: data['kind'] == withdrawalKind,
  );
}

/// Turns the platform's word for a permission into ours. Anything unknown is [PushPermission.unavailable].
PushPermission permissionFrom(Object? value) => switch (value) {
  'granted' => PushPermission.granted,
  'denied' => PushPermission.denied,
  'notAsked' => PushPermission.notAsked,
  _ => PushPermission.unavailable,
};

/// The gateway that talks to the platform.
class PlatformPushGateway implements PushGateway {
  PlatformPushGateway({MethodChannel? channel, EventChannel? events})
    : _channel = channel ?? pushChannel,
      _events = events ?? pushEventChannel;

  final MethodChannel _channel;
  final EventChannel _events;

  Stream<Map<Object?, Object?>>? _stream;

  @override
  Future<PushPermission> permission() => _ask('permission');

  @override
  Future<PushPermission> request() => _ask('request');

  @override
  Future<String?> token() async {
    final Object? answer = await _invoke('token');
    return answer is String && answer.isNotEmpty ? answer : null;
  }

  @override
  Stream<String> get tokens => _of(PushEventKind.token)
      .map((Map<Object?, Object?> event) => event['token'])
      .where((Object? token) => token is String && token.isNotEmpty)
      .cast<String>();

  @override
  Stream<PushArrival> get arrivals => _arrivals(PushEventKind.arrival);

  @override
  Stream<PushArrival> get openings => _arrivals(PushEventKind.opening);

  @override
  Future<void> withdraw(String requestId) async {
    await _invoke('withdraw', <String, Object?>{'tag': requestId});
  }

  @override
  Future<void> openSettings() async {
    await _invoke('openSettings');
  }

  Stream<PushArrival> _arrivals(String kind) => _of(
    kind,
  ).map(arrivalFrom).where((PushArrival? arrival) => arrival != null).cast<PushArrival>();

  Stream<Map<Object?, Object?>> _of(String kind) => _platform()
      .where((Map<Object?, Object?> event) => event['kind'] == kind)
      .map(
        (Map<Object?, Object?> event) => event['data'] is Map<Object?, Object?>
            ? event['data']! as Map<Object?, Object?>
            : event,
      );

  /// One broadcast subscription to the platform, shared by the three streams.
  ///
  /// An event channel opens a native listener per subscription, and three of them would have the
  /// platform deliver every notification three times.
  Stream<Map<Object?, Object?>> _platform() => _stream ??= _events
      .receiveBroadcastStream()
      .where((Object? event) => event is Map<Object?, Object?>)
      .cast<Map<Object?, Object?>>()
      .handleError(_ignore)
      .asBroadcastStream();

  /// A transport that is not there is not an error to surface: it is [PushPermission.unavailable],
  /// which the UI already has words for.
  static void _ignore(Object error) {}

  Future<PushPermission> _ask(String method) async => permissionFrom(await _invoke(method));

  Future<Object?> _invoke(String method, [Map<String, Object?>? arguments]) async {
    try {
      return await _channel.invokeMethod<Object?>(method, arguments);
    } on MissingPluginException {
      // No transport is wired into this build. Answering rather than throwing is what lets the
      // app run, and the UI say why notifications will not arrive (D-21).
      return null;
    } on PlatformException {
      return null;
    }
  }
}

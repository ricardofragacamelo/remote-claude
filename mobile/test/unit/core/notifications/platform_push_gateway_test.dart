/// The platform edge of push, and what it does when there is no platform behind it.
library;

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/notifications/platform_push_gateway.dart';
import 'package:remote_claude/core/notifications/push_gateway.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const MethodChannel channel = MethodChannel('test/push');

  /// Answers [answers] to every call, and records what was asked.
  List<MethodCall> install(Object? Function(MethodCall call) answers) {
    final List<MethodCall> calls = <MethodCall>[];

    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      channel,
      (MethodCall call) async {
        calls.add(call);
        return answers(call);
      },
    );

    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, null),
    );

    return calls;
  }

  group('reading what the platform sent', () {
    test('reads the three fields a notification is allowed to carry', () {
      final PushArrival? arrival = arrivalFrom(<Object?, Object?>{
        'kind': 'permissionRequested',
        'sessionId': 'session-1',
        'requestId': 'request-1',
        'expiresAt': '2026-09-20T12:00:00.000Z',
      });

      expect(arrival?.sessionId, 'session-1');
      expect(arrival?.requestId, 'request-1');
      expect(arrival?.expiresAt, DateTime.utc(2026, 9, 20, 12));
      expect(arrival?.isWithdrawal, isFalse);
    });

    test('a resolved message is a withdrawal', () {
      final PushArrival? arrival = arrivalFrom(<Object?, Object?>{
        'kind': 'permissionResolved',
        'sessionId': 's',
        'requestId': 'r',
        'expiresAt': '2026-09-20T12:00:00.000Z',
      });

      expect(arrival?.isWithdrawal, isTrue);
    });

    test('a payload missing a field, or carrying a date that is not one, is dropped', () {
      // It crossed somebody else's server and an operating system before arriving. A client that
      // throws on an unexpected field is a client that dies in the background, unseen.
      expect(arrivalFrom(<Object?, Object?>{'sessionId': 's', 'requestId': 'r'}), isNull);
      expect(
        arrivalFrom(<Object?, Object?>{
          'sessionId': 's',
          'requestId': 'r',
          'expiresAt': 'the day after tomorrow',
        }),
        isNull,
      );
      expect(
        arrivalFrom(<Object?, Object?>{'sessionId': 1, 'requestId': 'r', 'expiresAt': 'x'}),
        isNull,
      );
    });

    test('a permission the app does not recognise is unavailable, never granted', () {
      expect(permissionFrom('granted'), PushPermission.granted);
      expect(permissionFrom('denied'), PushPermission.denied);
      expect(permissionFrom('notAsked'), PushPermission.notAsked);
      expect(permissionFrom('perhaps'), PushPermission.unavailable);
      expect(permissionFrom(null), PushPermission.unavailable);
    });
  });

  group('talking to the platform', () {
    test('asks for the permission and the token, and passes the tag on a withdrawal', () async {
      final List<MethodCall> calls = install(
        (MethodCall call) => switch (call.method) {
          'permission' => 'denied',
          'request' => 'granted',
          'token' => 'token-123456',
          _ => null,
        },
      );

      final PlatformPushGateway gateway = PlatformPushGateway(channel: channel);

      expect(await gateway.permission(), PushPermission.denied);
      expect(await gateway.request(), PushPermission.granted);
      expect(await gateway.token(), 'token-123456');

      await gateway.withdraw('request-1');
      await gateway.openSettings();

      expect(calls.map((MethodCall call) => call.method), <String>[
        'permission',
        'request',
        'token',
        'withdraw',
        'openSettings',
      ]);
      expect(calls[3].arguments, <String, Object?>{'tag': 'request-1'});
    });

    test('an empty token is no token', () async {
      install((MethodCall call) => '');
      expect(await PlatformPushGateway(channel: channel).token(), isNull);
    });

    test('S-72 · no transport wired answers unavailable instead of throwing', () async {
      // Nothing is registered on this channel, so every call raises MissingPluginException. The
      // app has to keep running and say why notifications will not arrive (D-21).
      final PlatformPushGateway gateway = PlatformPushGateway(
        channel: const MethodChannel('nothing/is/here'),
      );

      expect(await gateway.permission(), PushPermission.unavailable);
      expect(await gateway.token(), isNull);
      await gateway.withdraw('r');
      await gateway.openSettings();
    });

    test('a platform that fails is unavailable, not a crash', () async {
      install((MethodCall call) => throw PlatformException(code: 'no'));

      expect(await PlatformPushGateway(channel: channel).request(), PushPermission.unavailable);
    });
  });

  group('what the platform streams', () {
    /// Pushes [events] down the event channel the gateway listens to.
    Future<void> emit(String name, List<Object?> events) async {
      const StandardMethodCodec codec = StandardMethodCodec();

      for (final Object? event in events) {
        await TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .handlePlatformMessage(name, codec.encodeSuccessEnvelope(event), (_) {});
      }
    }

    test('sorts tokens, arrivals and taps by what the platform called them', () async {
      const String name = 'test/push/events';
      const EventChannel events = EventChannel(name);

      // The stream side of an event channel needs the platform to answer `listen`; a mock handler
      // on the method channel of the same name is how a test provides that.
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel(name),
        (MethodCall call) async => null,
      );
      addTearDown(
        () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(const MethodChannel(name), null),
      );

      final PlatformPushGateway gateway = PlatformPushGateway(channel: channel, events: events);

      final Future<String> token = gateway.tokens.first;
      final Future<PushArrival> arrival = gateway.arrivals.first;
      final Future<PushArrival> opening = gateway.openings.first;

      await emit(name, <Object?>[
        <Object?, Object?>{
          'kind': 'token',
          'data': <Object?, Object?>{'token': 'token-999999'},
        },
        <Object?, Object?>{
          'kind': 'arrival',
          'data': <Object?, Object?>{
            'kind': 'permissionRequested',
            'sessionId': 's1',
            'requestId': 'r1',
            'expiresAt': '2026-09-20T12:00:00.000Z',
          },
        },
        <Object?, Object?>{
          'kind': 'opening',
          'data': <Object?, Object?>{
            'kind': 'permissionRequested',
            'sessionId': 's2',
            'requestId': 'r2',
            'expiresAt': '2026-09-20T12:00:00.000Z',
          },
        },
      ]);

      expect(await token, 'token-999999');
      expect((await arrival).requestId, 'r1');
      expect((await opening).sessionId, 's2');
    });
  });
}

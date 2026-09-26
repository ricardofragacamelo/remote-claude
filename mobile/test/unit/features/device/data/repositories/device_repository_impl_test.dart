import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/device/install_id.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/core/storage/credential_store.dart';
import 'package:remote_claude/features/device/data/datasources/device_api_data_source.dart';
import 'package:remote_claude/features/device/data/repositories/device_repository_impl.dart';
import 'package:remote_claude/features/device/domain/entities/registered_device.dart';

import '../../../../../support/fakes/fake_credential_store.dart';
import '../../../../../support/fakes/fake_credentials.dart';
import '../../../../../support/fakes/recording_writer.dart';

const AppConfig config = AppConfig(
  apiBaseUrl: 'http://localhost:3000',
  wsUrl: 'ws://localhost:3000/ws',
  oidcIssuer: 'http://localhost:8080/realms/rc',
  oidcClientId: 'remote-claude-mobile',
  oidcScopes: 'openid profile email offline_access',
  oidcRedirectUrl: 'rc://callback',
  appVersion: '1.2.3',
);

/// The backend, answering whatever the test set, and keeping what it was sent.
class _FakeApi implements DeviceApiDataSource {
  _FakeApi(this.answer);

  Object? answer;
  final List<Map<String, Object?>> bodies = <Map<String, Object?>>[];

  /// What `GET /devices` answers.
  Object? listed;

  @override
  Future<Object?> register(Map<String, Object?> body) async {
    bodies.add(body);
    return answer;
  }

  @override
  Future<Object?> list() async => listed;
}

Map<String, Object?> answerWith({String status = 'pending', bool pushEnabled = false}) =>
    <String, Object?>{
      'id': 'dev_1',
      'name': 'android 14',
      'status': status,
      'pushEnabled': pushEnabled,
    };

void main() {
  late FakeCredentialStore store;
  late DeviceIdentity identity;
  late RecordingWriter recorder;
  late AppLogger logger;

  setUp(() {
    store = FakeCredentialStore();
    identity = DeviceIdentity(store);
    recorder = RecordingWriter();
    logger = AppLogger(
      context: const LogContext(appVersion: '1.2.3', platform: 'android'),
      writer: recorder.writer,
    );
  });

  tearDown(() => logger.dispose());

  DeviceRepositoryImpl build(_FakeApi api, {String platform = 'android'}) => DeviceRepositoryImpl(
    api: api,
    identity: identity,
    config: config,
    credentials: FakeCredentials(locale: 'pt-BR'),
    logger: logger,
    traceIds: TraceIds(),
    platform: platform,
  );

  test('sends the installation id, the platform, the version and the language', () async {
    final _FakeApi api = _FakeApi(answerWith());

    await build(api).register(name: 'android 14');

    expect(api.bodies.single, <String, Object?>{
      'installId': store.values[DeviceKeys.installId],
      'name': 'android 14',
      'platform': 'android',
      'appVersion': '1.2.3',
      'locale': 'pt-BR',
    });
  });

  test('mints the installation id on the first registration', () async {
    final _FakeApi api = _FakeApi(answerWith());

    await build(api).register(name: 'android 14');

    expect(store.values[DeviceKeys.installId], isNotNull);
    expect(identity.installId, store.values[DeviceKeys.installId]);
  });

  test('leaves the push token out entirely when there is none', () async {
    final _FakeApi api = _FakeApi(answerWith());

    await build(api).register(name: 'android 14');

    expect(api.bodies.single.containsKey('pushToken'), isFalse);
  });

  test('sends the push token when the provider has given one', () async {
    final _FakeApi api = _FakeApi(answerWith(pushEnabled: true));

    await build(api).register(name: 'android 14', pushToken: 'fcm-token');

    expect(api.bodies.single['pushToken'], 'fcm-token');
  });

  // Only Android is exercised in this plan; the app still builds for iOS (D-12). Anything the
  // contract does not name is reported as Android rather than refused, because the alternative
  // is a test host registering as a platform the backend rejects.
  test('reports the platform the contract knows', () {
    expect(platformName('ios'), 'ios');
    expect(platformName('android'), 'android');
    expect(platformName('linux'), 'android');
  });

  test('answers the device the backend described', () async {
    final _FakeApi api = _FakeApi(answerWith(status: 'approved'));

    final RegisteredDevice device = await build(api).register(name: 'android 14');

    expect(device.status, DeviceStatus.approved);
    expect(device.canDecide, isTrue);
  });

  test('fails with a Failure when the answer is not a device', () async {
    final _FakeApi api = _FakeApi(<String, Object?>{'unexpected': true});

    await expectLater(build(api).register(name: 'android 14'), throwsA(isA<ServerFailure>()));
  });

  test('logs the registration at info, with the state the backend answered', () async {
    final _FakeApi api = _FakeApi(answerWith());

    await build(api).register(name: 'android 14');

    final Map<String, Object?> line = recorder.withOp(LogOp.deviceRegistered).single;
    expect(line['deviceId'], 'dev_1');
    expect(line['status'], 'pending');
    expect(recorder.levels.last, 'info');
  });

  // S-14
  test('logs only the last six characters of the push token', () async {
    final _FakeApi api = _FakeApi(answerWith(pushEnabled: true));

    await build(api).register(name: 'android 14', pushToken: 'AAAAAAAAAAAAAAAAabcdef');

    final Map<String, Object?> line = recorder.withOp(LogOp.deviceRegistered).single;
    expect(line['pushTokenTail'], 'abcdef');
    expect(recorder.lines.join(), isNot(contains('AAAAAAAAAAAAAAAA')));
  });

  test('says nothing about a token that does not exist', () async {
    final _FakeApi api = _FakeApi(answerWith());

    await build(api).register(name: 'android 14');

    expect(recorder.withOp(LogOp.deviceRegistered).single['pushTokenTail'], isNull);
  });

  // S-56 — the status is read, never re-registered: re-registering would overwrite the push token.
  group('where this device stands', () {
    test('is read from the list, by the id it was registered under', () async {
      final _FakeApi api = _FakeApi(null)
        ..listed = <String, Object?>{
          'devices': <Object?>[
            <String, Object?>{'id': 'dev_0', 'name': 'other', 'status': 'approved'},
            answerWith(status: 'revoked'),
          ],
        };

      final RegisteredDevice device = await build(api).current('dev_1');

      expect(device.status, DeviceStatus.revoked);
      expect(api.bodies, isEmpty);
      expect(recorder.withOp('device.register').last['status'], 'revoked');
    });

    test('a device the backend no longer lists is a failure, not an absence', () async {
      final _FakeApi api = _FakeApi(null)..listed = <String, Object?>{'devices': <Object?>[]};

      await expectLater(
        build(api).current('dev_1'),
        throwsA(isA<ServerFailure>().having((ServerFailure f) => f.code, 'code', 'NOT_FOUND')),
      );
    });
  });
}

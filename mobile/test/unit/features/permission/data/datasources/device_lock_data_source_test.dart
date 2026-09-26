/// The operating system's lock screen, and the owner's preference about it.
library;

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:local_auth/local_auth.dart';
import 'package:mocktail/mocktail.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/storage/credential_store.dart';
import 'package:remote_claude/features/permission/data/datasources/device_lock_data_source.dart';
import 'package:remote_claude/features/permission/domain/repositories/approval_lock.dart';

import '../../../../../support/fakes/fake_credential_store.dart';
import '../../../../../support/fakes/recording_writer.dart';

/// The plugin's class talks to a platform channel: a fake would re-implement a plugin, so this is
/// where a mock pays off.
class _MockLocalAuthentication extends Mock implements LocalAuthentication {}

void main() {
  group('LocalAuthApprovalLock', () {
    late _MockLocalAuthentication auth;
    late RecordingWriter recorder;
    late AppLogger logger;
    late LocalAuthApprovalLock lock;

    setUp(() {
      auth = _MockLocalAuthentication();
      recorder = RecordingWriter();
      logger = AppLogger(
        context: const LogContext(appVersion: '0.0.1', platform: 'android'),
        writer: recorder.writer,
      );
      lock = LocalAuthApprovalLock(logger: logger, auth: auth);
    });

    tearDown(() => logger.dispose());

    void answerAuthenticate(Future<bool> Function() answer) => when(
      () => auth.authenticate(
        localizedReason: any(named: 'localizedReason'),
        authMessages: any(named: 'authMessages'),
        biometricOnly: any(named: 'biometricOnly'),
        sensitiveTransaction: any(named: 'sensitiveTransaction'),
        persistAcrossBackgrounding: any(named: 'persistAcrossBackgrounding'),
      ),
    ).thenAnswer((_) => answer());

    Map<String, Object?> lastWarning() {
      expect(recorder.levels.last, 'warn');
      return recorder.withOp(LogOp.deviceLock).last;
    }

    test('builds over the real plugin when none is given, without touching the platform', () {
      expect(LocalAuthApprovalLock(logger: logger), isA<ApprovalLock>());
    });

    group('isAvailable', () {
      test('is true on a device with a lock', () async {
        when(() => auth.isDeviceSupported()).thenAnswer((_) async => true);

        expect(await lock.isAvailable(), isTrue);
        expect(recorder.withOp(LogOp.deviceLock).last['available'], isTrue);
      });

      test('is false on a device without one', () async {
        when(() => auth.isDeviceSupported()).thenAnswer((_) async => false);

        expect(await lock.isAvailable(), isFalse);
      });

      test('is false, and warns, when the platform cannot say', () async {
        when(() => auth.isDeviceSupported()).thenThrow(PlatformException(code: 'no_activity'));

        expect(await lock.isAvailable(), isFalse);
        expect(lastWarning()['err'], 'PlatformException');
      });
    });

    group('confirm', () {
      test('is confirmed when the owner proves it', () async {
        answerAuthenticate(() async => true);

        expect(await lock.confirm('Approve rm -rf build/'), LockVerdict.confirmed);
        expect(recorder.withOp(LogOp.deviceLock).last['confirmed'], isTrue);
      });

      test('is refused when the owner does not', () async {
        answerAuthenticate(() async => false);

        expect(await lock.confirm('Approve rm -rf build/'), LockVerdict.refused);
      });

      test('is refused, and warns, when the prompt could not be shown', () async {
        answerAuthenticate(
          () async => throw const LocalAuthException(code: LocalAuthExceptionCode.uiUnavailable),
        );

        expect(await lock.confirm('Approve rm -rf build/'), LockVerdict.refused);
        expect(lastWarning()['err'], 'LocalAuthException');
      });

      test('is refused, and warns, when the platform channel itself fails', () async {
        answerAuthenticate(() async => throw PlatformException(code: 'channel-error'));

        expect(await lock.confirm('Approve rm -rf build/'), LockVerdict.refused);
        expect(lastWarning()['err'], 'PlatformException');
      });

      test('S-44 accepts the device PIN, never biometrics only, and says why it asks', () async {
        answerAuthenticate(() async => true);

        await lock.confirm('Approve rm -rf build/');

        final List<dynamic> captured = verify(
          () => auth.authenticate(
            localizedReason: captureAny(named: 'localizedReason'),
            authMessages: any(named: 'authMessages'),
            biometricOnly: captureAny(named: 'biometricOnly'),
            sensitiveTransaction: any(named: 'sensitiveTransaction'),
            persistAcrossBackgrounding: captureAny(named: 'persistAcrossBackgrounding'),
          ),
        ).captured;

        expect(captured, <Object?>['Approve rm -rf build/', false, true]);
      });
    });
  });

  group('SecureApprovalPreferences', () {
    late FakeCredentialStore store;
    late SecureApprovalPreferences preferences;

    setUp(() {
      store = FakeCredentialStore();
      preferences = SecureApprovalPreferences(store);
    });

    test('asks by default, when nothing was ever stored', () async {
      expect(await preferences.lockRequired(), isTrue);
    });

    test('does not ask once turned off', () async {
      store.values[approvalLockKey] = 'false';

      expect(await preferences.lockRequired(), isFalse);
    });

    test('asks when turned on', () async {
      store.values[approvalLockKey] = 'true';

      expect(await preferences.lockRequired(), isTrue);
    });

    test('asks for anything but the literal false', () async {
      for (final String stored in <String>['False', '0', '', 'no']) {
        store.values[approvalLockKey] = stored;

        expect(await preferences.lockRequired(), isTrue, reason: stored);
      }
    });

    test('turning it off writes false under its key', () async {
      await preferences.setLockRequired(required: false);

      expect(store.values[approvalLockKey], 'false');
      expect(await preferences.lockRequired(), isFalse);
    });

    test('turning it on writes true under its key', () async {
      await preferences.setLockRequired(required: true);

      expect(store.values[approvalLockKey], 'true');
    });

    // Whether this phone asks for a fingerprint is a property of the phone, not of the account.
    test('survives a logout', () async {
      await preferences.setLockRequired(required: false);

      await store.clear();

      expect(CredentialKeys.all, isNot(contains(approvalLockKey)));
      expect(await preferences.lockRequired(), isFalse);
    });
  });
}

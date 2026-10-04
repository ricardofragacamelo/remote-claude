/// The choice of address, kept on the phone (plan 10, B-28, D-18).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/config/connection_choice.dart';
import 'package:remote_claude/core/config/connection_store.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/storage/credential_store.dart';

import '../../../support/fakes/fake_credential_store.dart';
import '../../../support/fakes/recording_writer.dart';

void main() {
  late FakeCredentialStore storage;
  late RecordingWriter log;
  late ConnectionStore store;

  setUp(() {
    storage = FakeCredentialStore();
    log = RecordingWriter();
    store = ConnectionStore(
      storage,
      logger: AppLogger(
        context: const LogContext(appVersion: '1.0.0', platform: 'android'),
        writer: log.writer,
      ),
    );
  });

  test('nothing saved is no choice', () async {
    expect(await store.read(), isNull);
  });

  test(
    'S-98 · saved, read back — the text of the third radio kept with another one chosen',
    () async {
      await store.write(
        const ConnectionChoice(ConnectionKind.internal, other: 'https://mine.example'),
      );

      expect(
        await store.read(),
        const ConnectionChoice(ConnectionKind.internal, other: 'https://mine.example'),
      );
      expect(storage.values[ConnectionKeys.choice], '1:internal');
      expect(log.withOp('connection.write').single['kind'], 'internal');
    },
  );

  test('S-98 · signing out clears the credentials and never the choice', () async {
    await storage.write(CredentialKeys.accessToken, 'token');
    await store.write(const ConnectionChoice(ConnectionKind.other, other: 'https://mine.example'));

    await storage.clear();

    expect(storage.values.keys, isNot(contains(CredentialKeys.accessToken)));
    expect(
      await store.read(),
      const ConnectionChoice(ConnectionKind.other, other: 'https://mine.example'),
    );
    expect(CredentialKeys.all, isNot(contains(ConnectionKeys.choice)));
    expect(CredentialKeys.all, isNot(contains(ConnectionKeys.other)));
  });

  test(
    'S-99 · a value this build cannot read — another version, a radio it does not know — is no choice, said',
    () async {
      for (final String unreadable in <String>[
        '2:internal',
        '1:wifi',
        'internal',
        '1:internal:x',
      ]) {
        storage.values[ConnectionKeys.choice] = unreadable;

        expect(await store.read(), isNull, reason: unreadable);
      }

      expect(log.withOp('connection.read'), hasLength(4));
      expect(log.levels.toSet(), contains('warn'));
    },
  );

  test('works without a logger', () async {
    const ConnectionStore quiet = ConnectionStore(FakeCredentialStoreConst.instance);
    expect(await quiet.read(), isNull);
  });
}

/// A store with nothing in it, usable where a constant is wanted.
class FakeCredentialStoreConst implements CredentialStore {
  const FakeCredentialStoreConst._();

  static const FakeCredentialStoreConst instance = FakeCredentialStoreConst._();

  @override
  Future<String?> read(String key) async => key == ConnectionKeys.choice ? 'nonsense' : null;

  @override
  Future<void> write(String key, String value) async {}

  @override
  Future<void> clear() async {}
}

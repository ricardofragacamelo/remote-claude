/// The address the app talks through, and the configuration that follows from it (plan 10, B-28).
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/config/app_config_provider.dart';
import 'package:remote_claude/core/config/connection_choice.dart';
import 'package:remote_claude/core/config/connection_store.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/core/network/api_client_provider.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/core/storage/credential_store_provider.dart';

import '../../../support/builders/config.dart';
import '../../../support/fakes/fake_credential_store.dart';
import '../../../support/fakes/recording_writer.dart';

void main() {
  late FakeCredentialStore storage;

  ProviderContainer build({BuildConfig? config, ConnectionChoice? saved}) {
    FlutterSecureStorage.setMockInitialValues(<String, String>{});
    storage = FakeCredentialStore();
    final AppLogger logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: RecordingWriter().writer,
    );
    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        buildConfigProvider.overrideWithValue(
          config ?? aBuildConfig(external: 'https://claude.example.dev'),
        ),
        savedConnectionProvider.overrideWithValue(saved),
        credentialStoreProvider.overrideWithValue(storage),
        appLoggerProvider.overrideWithValue(logger),
      ],
    );
    addTearDown(() async {
      container.dispose();
      await logger.dispose();
    });
    return container;
  }

  ConnectionController controller(ProviderContainer container) =>
      container.read(connectionControllerProvider.notifier);

  test('S-97 · the first launch talks through the internal address', () {
    final ProviderContainer container = build();

    expect(container.read(currentOriginProvider), 'http://localhost:5173');
    expect(container.read(hasOriginProvider), isTrue);
    expect(container.read(appConfigProvider).apiBaseUrl, 'http://localhost:5173/api');
  });

  test('S-97 · with no address at all there is none, and no configuration to read', () {
    final ProviderContainer container = build(config: aBuildConfig(internal: null));

    expect(container.read(hasOriginProvider), isFalse);
    expect(() => container.read(appConfigProvider), throwsA(isA<Object>()));
  });

  test('a choice saved before is what the app starts on', () {
    final ProviderContainer container = build(
      saved: const ConnectionChoice(ConnectionKind.external),
    );

    expect(container.read(appConfigProvider).wsUrl, 'wss://claude.example.dev/ws');
  });

  test(
    'S-101 · a new address: saved on the phone, and the HTTP client and the socket rebuilt on it',
    () async {
      final ProviderContainer container = build();
      final ApiClient before = container.read(apiClientProvider);
      final WsClient socketBefore = container.read(wsClientProvider);

      expect(
        await controller(container).save(const ConnectionChoice(ConnectionKind.external)),
        isTrue,
      );

      expect(storage.values[ConnectionKeys.choice], '1:external');
      expect(
        container.read(appConfigProvider).oidcIssuer,
        'https://claude.example.dev/realms/remote-claude',
      );
      // S-102 · nothing of the old origin answers any more: both were built again, on the new one.
      expect(container.read(apiClientProvider), isNot(same(before)));
      expect(container.read(wsClientProvider), isNot(same(socketBefore)));
    },
  );

  test('S-103 · the same choice again writes nothing and moves nothing', () async {
    final ProviderContainer container = build(
      saved: const ConnectionChoice(ConnectionKind.internal),
    );
    final ApiClient before = container.read(apiClientProvider);

    expect(
      await controller(container).save(const ConnectionChoice(ConnectionKind.internal)),
      isFalse,
    );

    expect(storage.writes, 0);
    expect(container.read(apiClientProvider), same(before));
  });

  test('another text in the third radio, on the same address, is kept without moving', () async {
    final ProviderContainer container = build();

    expect(
      await controller(
        container,
      ).save(const ConnectionChoice(ConnectionKind.internal, other: 'https://later.example')),
      isFalse,
    );

    expect(storage.values[ConnectionKeys.other], 'https://later.example');
    expect(
      container.read(connectionControllerProvider).saved,
      const ConnectionChoice(ConnectionKind.internal, other: 'https://later.example'),
    );
  });

  test('a choice with no address to use is refused, and nothing is written', () async {
    final ProviderContainer container = build(config: aBuildConfig());

    expect(
      await controller(container).save(const ConnectionChoice(ConnectionKind.external)),
      isFalse,
    );
    expect(
      await controller(
        container,
      ).save(const ConnectionChoice(ConnectionKind.other, other: 'http://203.0.113.10')),
      isFalse,
    );
    expect(storage.writes, 0);
  });

  test('settings compare by value', () {
    expect(
      const ConnectionSetting(resolution: ConnectionResolution()),
      const ConnectionSetting(resolution: ConnectionResolution()),
    );
  });
}

/// Where the ephemeral stack of this run is, what the shared scenarios expect, and the world every
/// test of the app builds.
///
/// Flutter has no `.env` at runtime, so everything arrives through `--dart-define` — which is
/// also what makes this work on a real device, where the repository's files do not exist. The
/// values are written by `scripts/run-e2e-local.mjs`, the same script that brings the stack up for
/// the Playwright suite, so both ends test the same running system.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/app/app.dart';
import 'package:remote_claude/app/bootstrap.dart';
import 'package:remote_claude/app/router_provider.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/device/device_identity_provider.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/storage/credential_store_provider.dart';
import 'package:remote_claude/features/auth/auth.dart';
import 'package:remote_claude/features/auth/auth_providers.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/permission/domain/repositories/approval_lock.dart';
import 'package:remote_claude/features/permission/permission_providers.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/workspace/workspace.dart';

import 'direct_grant_data_source.dart';

/// The configuration of the running stack.
///
/// It reads `appDefines` — the same list the entry point reads, so this run is configured exactly
/// the way a real build is.
///
/// @throws [ConfigurationError] naming every missing define, rather than failing later with a
///   connection refused that says nothing about the cause
AppConfig e2eConfig() => AppConfig.from(appDefines);

/// One scenario of `e2e/scenarios/`, handed over as JSON.
///
/// The file itself is never read here: on a device there is no repository to read it from. The
/// runner reads every scenario this end runs and compiles them in, by file name, which keeps the
/// two ends on one copy of the expectations — see `e2e/scenarios/index.ts` for the other half.
class E2eScenario {
  E2eScenario(Map<String, Object?> raw)
    : id = raw['id']! as String,
      title = raw['title']! as String,
      user = (raw['user']! as Map<String, Object?>).cast<String, String>(),
      expect = raw['expect']! as Map<String, Object?>;

  /// Reads the scenario the runner compiled in under [name] — its file name, without `.json`.
  factory E2eScenario.named(String name) {
    const String raw = String.fromEnvironment('RC_SCENARIO');

    if (raw.isEmpty) {
      throw StateError(
        'RC_SCENARIO is empty: run this through `pnpm test:e2e:mobile`, which brings the stack up '
        'and compiles the shared scenarios in.',
      );
    }

    final Object? scenario = (jsonDecode(raw) as Map<String, Object?>)[name];

    if (scenario is! Map<String, Object?>) {
      throw StateError(
        'e2e/scenarios/$name.json was not compiled in — the two ends are out of step',
      );
    }

    return E2eScenario(scenario);
  }

  /// `S-nn` of the plan that owns the scenario.
  final String id;

  /// What the scenario proves, in one line.
  final String title;

  /// Credentials of a user of the local realm.
  final Map<String, String> user;

  /// What the run has to observe.
  final Map<String, Object?> expect;

  /// An expected value, as an integer.
  int integer(String key) => expect[key]! as int;

  /// An expected value, as a string.
  String text(String key) => expect[key]! as String;

  /// An expected list of integers.
  List<int> integers(String key) => (expect[key]! as List<Object?>).cast<int>();
}

/// The lock an emulator cannot offer.
///
/// The emulator of this suite has no screen lock, and the system prompt that biometrics or a PIN
/// shows is the operating system's, not the app's — no widget test can press it. So this edge is
/// replaced, like the external sign-in tab and the Keychain are, and the rule it guards is proved
/// where it can be: the gate, in unit tests, and the prompt's arguments, against the plugin.
class ConfirmingLock implements ApprovalLock {
  @override
  Future<bool> isAvailable() async => true;

  @override
  Future<LockVerdict> confirm(String reason) async => LockVerdict.confirmed;
}

/// The same world `main.dart` builds, with the edges a headless run cannot have replaced.
///
/// Configuration **and** the logger come from the same helper the entry point uses: overriding
/// only half of it leaves `appLoggerProvider` throwing on the first widget that reads it.
ProviderContainer e2eContainer(AppConfig config, E2eScenario scenario) {
  final AppLogger logger = buildLogger(
    config: config,
    platform: defaultTargetPlatform.name,
    isRelease: kReleaseMode,
  );

  return ProviderContainer(
    overrides: <Override>[
      ...bootstrapOverrides(config: config, logger: logger),
      // The operating system's external tab, the Keychain and the lock screen.
      credentialStoreProvider.overrideWithValue(MemoryCredentialStore()),
      oidcAuthDataSourceProvider.overrideWithValue(
        DirectGrantDataSource(
          config: config,
          username: scenario.user['username']!,
          password: scenario.user['password']!,
        ),
      ),
      approvalLockProvider.overrideWithValue(ConfirmingLock()),
    ],
  );
}

/// Mounts the app over [container], and lets its first frames settle.
Future<void> mountApp(WidgetTester tester, ProviderContainer container) async {
  await tester.pumpWidget(
    UncontrolledProviderScope(container: container, child: const RemoteClaudeApp()),
  );
  await tester.pumpAndSettle();
}

/// Signs in, and waits for the installation to be registered.
///
/// The installation id is minted first, as `main.dart` does before the socket opens: the handshake
/// names the installation, and a socket opened before there is one is a socket the backend takes
/// for a browser — which a revocation then has nothing to close.
Future<void> signedInOnThisDevice(WidgetTester tester, ProviderContainer container) async {
  await container.read(deviceIdentityProvider).ensure();
  await mountApp(tester, container);

  await container.read(authControllerProvider.notifier).signIn();
  await pumpUntil(tester, () => container.read(deviceControllerProvider).value != null);
}

/// Opens a session on the first folder of the allowlist, through the list, and answers its id.
Future<String> sessionOpenedFromTheList(WidgetTester tester, ProviderContainer container) async {
  container.read(routerProvider).go(workspacesRoute);

  // A tile **of the list**: the home screen being left has one too — the approval lock switch —
  // and it is still in the tree while the transition runs.
  final Finder folder = find.descendant(
    of: find.byType(WorkspaceListPage),
    matching: find.byType(ListTile),
  );
  await pumpUntil(tester, () => folder.evaluate().isNotEmpty);
  await tester.pumpAndSettle();

  await tester.tap(folder.first);
  await pumpUntil(tester, () => find.byType(SessionPage).evaluate().isNotEmpty);

  return tester.widget<SessionPage>(find.byType(SessionPage)).sessionId;
}

/// The browser's side of the backend, for what only a browser may do.
///
/// Approving a phone is refused **to a phone** (S-06): it goes out without the installation header,
/// exactly as the web front sends it. Nothing here is the app's own code.
class BackendAsBrowser {
  BackendAsBrowser(AppConfig config, String accessToken)
    : _dio = Dio(
        BaseOptions(
          baseUrl: config.apiBaseUrl,
          headers: <String, Object?>{'authorization': 'Bearer $accessToken'},
        ),
      );

  final Dio _dio;

  /// Lets the device [deviceId] decide.
  Future<void> approve(String deviceId) => _dio.post<Object?>('/devices/$deviceId/approval');

  /// Takes the device [deviceId] out.
  Future<void> revoke(String deviceId) => _dio.delete<Object?>('/devices/$deviceId/approval');

  /// The first folder of the allowlist — where the browser opens its session.
  Future<String> firstWorkspace() async {
    final Response<Map<String, Object?>> response = await _dio.get<Map<String, Object?>>(
      '/workspaces',
    );
    final List<Object?> roots = response.data!['workspaces']! as List<Object?>;

    return (roots.first! as Map<String, Object?>)['path']! as String;
  }

  /// The standing rules of this account, as the browser lists them.
  Future<List<Map<String, Object?>>> rules() async {
    final Response<Map<String, Object?>> response = await _dio.get<Map<String, Object?>>(
      '/permission-rules',
    );

    return (response.data!['rules']! as List<Object?>).cast<Map<String, Object?>>();
  }

  /// One rule, in whatever state it is.
  Future<Map<String, Object?>> rule(String ruleId) async =>
      (await _dio.get<Map<String, Object?>>('/permission-rules/$ruleId')).data!;

  /// Grants a rule from the browser — the second way a rule is born (D-10).
  Future<Map<String, Object?>> grantRule(String pattern) async =>
      (await _dio.post<Map<String, Object?>>(
        '/permission-rules',
        data: <String, Object?>{'pattern': pattern, 'decision': 'allow', 'scope': 'always'},
      )).data!;

  /// Takes a rule back from the browser, and answers what the server said.
  Future<Response<Map<String, Object?>>> revokeRule(String ruleId) =>
      _dio.delete<Map<String, Object?>>('/permission-rules/$ruleId');

  /// Takes back every rule this account still holds. A rule left standing by a failed test would
  /// answer the next test's question, so every test that grants one ends here.
  Future<void> revokeEveryRule() async {
    for (final Map<String, Object?> standing in await rules()) {
      await revokeRule(standing['id']! as String);
    }
  }
}

/// A browser's socket, from the outside: it prompts a session **without attaching to it**.
///
/// With anybody attached the backend sends no push — correctly, S-16 — so the turn that asks for
/// permission while the phone is in the background has to come from a connection that watches
/// nothing. Owning the session is what `session.prompt` asks for; watching it is not.
class BrowserSocket {
  BrowserSocket._(this._socket);

  final WebSocket _socket;

  /// Every frame received, in arrival order.
  final List<Map<String, Object?>> frames = <Map<String, Object?>>[];

  /// Opens the socket and completes the handshake, as a browser — no installation.
  static Future<BrowserSocket> open(AppConfig config, String accessToken) async {
    final WebSocket socket = await WebSocket.connect('${config.wsUrl}?v=1');
    final Stream<Map<String, Object?>> frames = socket
        .map((Object? raw) => jsonDecode(raw! as String) as Map<String, Object?>)
        .asBroadcastStream();
    final BrowserSocket browser = BrowserSocket._(socket);
    frames.listen(browser.frames.add);

    final Future<Map<String, Object?>> ready = frames.firstWhere(
      (Map<String, Object?> frame) => frame['type'] == 'connection.ready',
    );
    browser._send('connection.authenticate', <String, Object?>{
      'token': accessToken,
      'locale': 'en',
      'client': <String, Object?>{'kind': 'web', 'version': 'e2e'},
    });
    await ready.timeout(const Duration(seconds: 15));

    return browser;
  }

  /// Opens a session on [workspacePath], as the browser does, and answers the id the server minted.
  Future<String> start(String workspacePath) async {
    final int mark = frames.length;
    _send('session.start', <String, Object?>{'workspacePath': workspacePath});
    final Map<String, Object?> started = await waitFor(
      (Map<String, Object?> frame) => frame['type'] == 'session.started',
      from: mark,
    );

    return (started['payload']! as Map<String, Object?>)['sessionId']! as String;
  }

  /// Ends [sessionId]. Closing a socket alone keeps the session — and its subprocess — alive.
  Future<void> closeSession(String sessionId) async {
    final int mark = frames.length;
    _send('session.close', <String, Object?>{'sessionId': sessionId});
    await waitFor(
      (Map<String, Object?> frame) =>
          frame['type'] == 'session.closed' && frame['sessionId'] == sessionId,
      from: mark,
    );
  }

  /// The first frame, from index [from] on, that matches — already received or still to come.
  Future<Map<String, Object?>> waitFor(
    bool Function(Map<String, Object?> frame) match, {
    int from = 0,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    Map<String, Object?>? found;
    await waitUntil(
      () async {
        found = frames.skip(from).where(match).firstOrNull;
        return found != null;
      },
      timeout: timeout,
      what: 'a matching frame on the browser socket',
    );

    return found!;
  }

  /// Sends a turn to [sessionId], naming the recording the scripted backend replays.
  void prompt(String sessionId, String fixture) => _send('session.prompt', <String, Object?>{
    'sessionId': sessionId,
    'text': 'do the work [fixture:$fixture]',
  });

  /// Closes the socket the way a browser does.
  Future<void> close() => _socket.close(1000);

  void _send(String type, Map<String, Object?> payload) => _socket.add(
    jsonEncode(<String, Object?>{
      'v': 1,
      'id': '${DateTime.now().microsecondsSinceEpoch}-$type',
      'kind': 'command',
      'type': type,
      'ts': DateTime.now().toUtc().toIso8601String(),
      'payload': payload,
    }),
  );
}

/// Asks [ready] until it answers `true`, or fails saying what never happened.
///
/// For conditions outside the widget tree — the tray, the system dialog — where pumping frames is
/// not what makes them change.
Future<void> waitUntil(
  Future<bool> Function() ready, {
  Duration timeout = const Duration(seconds: 60),
  String what = 'the condition',
}) async {
  final DateTime deadline = DateTime.now().add(timeout);

  while (!await ready()) {
    if (DateTime.now().isAfter(deadline)) {
      fail('$what never held within ${timeout.inSeconds}s');
    }
    await Future<void>.delayed(const Duration(milliseconds: 500));
  }
}

/// Pumps until [ready] holds, or fails saying what never happened.
///
/// `pumpAndSettle` cannot be used to wait for the network: it settles as soon as no animation is
/// pending, which happens long before a frame comes back over the socket. And a fixed delay is a
/// flaky test by construction — see docs/architecture/shared/06-testing-strategy.md.
Future<void> pumpUntil(
  WidgetTester tester,
  bool Function() ready, {
  Duration timeout = const Duration(seconds: 30),
}) async {
  final DateTime deadline = DateTime.now().add(timeout);

  while (!ready()) {
    if (DateTime.now().isAfter(deadline)) {
      fail('the condition never held within ${timeout.inSeconds}s');
    }
    await tester.pump(const Duration(milliseconds: 50));
  }

  await tester.pump();
}

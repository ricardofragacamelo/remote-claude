/// The names of the engines, put above every screen once somebody is signed in (plan 28, B-13).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/widgets/agent_names.dart';
import 'package:remote_claude/features/auth/auth.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/session/session_providers.dart';

import '../../../support/builders/conversations.dart';
import '../../../support/fakes/fake_engine_repository.dart';
import '../../../support/pump_app.dart';

/// Whoever is signed in, as the test says — and a sign-in the test performs.
class _Auth extends AuthController {
  _Auth(this._session);

  final AuthSession? _session;

  @override
  Future<AuthSession?> build() async => _session;

  void become(AuthSession? session) => state = AsyncValue<AuthSession?>.data(session);
}

AuthSession someone() => AuthSession(
  accessToken: 'token',
  refreshToken: null,
  userId: 'user-1',
  issuedAt: DateTime.utc(2026, 10, 10),
  expiresAt: DateTime.utc(2026, 10, 10, 1),
);

/// Says how the names above it call [anEngine], and with no engine named.
class _Reader extends StatelessWidget {
  const _Reader();

  @override
  Widget build(BuildContext context) {
    final AgentNames names = AgentNamesScope.of(context);
    return Text('named ${names.nameOf(anEngine)} · default ${names.nameOf(null)}');
  }
}

void main() {
  late FakeEngineRepository engines;

  setUp(() => engines = FakeEngineRepository());

  Future<void> pump(WidgetTester tester, {AuthSession? signedIn}) => tester.pumpApp(
    const EngineNames(child: _Reader()),
    overrides: <Override>[
      authControllerProvider.overrideWith(() => _Auth(signedIn)),
      engineRepositoryProvider.overrideWithValue(engines),
    ],
  );

  testWidgets('signed in, an engine is named by the display name the backend gave it', (
    WidgetTester tester,
  ) async {
    await pump(tester, signedIn: someone());
    await tester.pumpAndSettle();

    expect(find.text('named $anEngineName · default $anEngineName'), findsOneWidget);
    expect(engines.asked, 1);
  });

  testWidgets('signed out, the list is not asked for, and an engine is named by its id', (
    WidgetTester tester,
  ) async {
    await pump(tester);
    await tester.pumpAndSettle();

    expect(find.text('named $anEngine · default '), findsOneWidget);
    expect(engines.asked, 0);
  });

  testWidgets('a list that did not come leaves the ids — never a gap, never a made-up name', (
    WidgetTester tester,
  ) async {
    engines.failure = const NetworkFailure(traceId: 't');
    await pump(tester, signedIn: someone());
    await tester.pumpAndSettle();

    expect(find.text('named $anEngine · default '), findsOneWidget);
  });

  testWidgets('signing in asks for the list, and the names arrive', (WidgetTester tester) async {
    await pump(tester);
    await tester.pumpAndSettle();

    final ProviderContainer container = ProviderScope.containerOf(
      tester.element(find.byType(_Reader)),
    );
    (container.read(authControllerProvider.notifier) as _Auth).become(someone());
    await tester.pumpAndSettle();

    expect(find.text('named $anEngineName · default $anEngineName'), findsOneWidget);
    expect(engines.asked, 1);
  });
}

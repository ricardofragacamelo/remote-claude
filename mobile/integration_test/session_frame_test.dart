/// Plan 10, F1 — the frame of the session screen, in the real app, against the real backend.
///
/// S-26: a phone puts the app away in the middle of writing. The socket goes — as it should, in the
/// background — and comes back when the app does: it reconnects, asks for what it missed from where
/// it got to, and the conversation shows nothing twice. What was written in the box is still there.
///
/// The background is driven through the same function the app's lifecycle listener calls, so what
/// is under test is the app's own reaction, not a simulation of it.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:remote_claude/app/lifecycle.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/session/session.dart';

import 'support/e2e_environment.dart';
import 'support/session_robot.dart';
import 'support/signed_in_app.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final BuildConfig config = e2eConfig();
  final E2eScenario background = E2eScenario.named('mobile-session-frame');

  testWidgets('${background.id} — ${background.title}', (WidgetTester tester) async {
    final SignedInApp app = await signedInApp(tester, config, background);
    final SessionRobot robot = app.robot(tester);
    final WsClient socket = app.container.read(wsClientProvider);

    final String sessionId = await robot.startSession(
      app.container,
      'do the work [fixture:${background.text('fixture')}]',
    );
    Conversation conversation() =>
        app.container.read(liveSessionControllerProvider(sessionId)).conversation;
    await pumpUntil(tester, () => conversation().lastTurn != null);
    final List<String> before = conversation().entries
        .map((ConversationEntry entry) => entry.entryId)
        .toList();

    await robot.write(background.text('written'));

    // Away: the socket closes, as it should in the background.
    await applyLifecycle(AppLifecycleState.paused, socket, app.container.read(appLoggerProvider));
    await pumpUntil(tester, () => socket.status != ConnectionStatus.ready);

    // Back: it reconnects and replays from where the screen got to.
    await applyLifecycle(AppLifecycleState.resumed, socket, app.container.read(appLoggerProvider));
    await pumpUntil(tester, () => socket.status == ConnectionStatus.ready);
    await tester.pumpAndSettle();

    expect(conversation().entries.map((ConversationEntry entry) => entry.entryId).toList(), before);
    expect(tester.widget<TextField>(robot.box).controller?.text, background.text('written'));
    expect(robot.sessionOnScreen, sessionId);
  });
}

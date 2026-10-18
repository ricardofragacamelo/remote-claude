/// Plan 28, F7, B-45 — the app's own panel of a second engine, for real (S-125, S-126).
///
/// The neutrality gate (`pnpm neutral:check`) proves the **absence** of a motor's name in the
/// source; it proves nothing about a running screen. This is the test that does, on the app, the
/// same proof `e2e/specs/engine-neutral-panel.spec.ts` makes on the web for B-44: a conversation
/// opened on the test engine of B-43 — other native tools, fewer capabilities, its own scripted
/// turns — rendered by the same build Claude's own e2e specs run against.
///
/// Every helper below but the engine picker itself is the **unmodified** one `SessionRobot` has
/// carried since plan 10 — `pick`, `openDraft`, `sentFromTheDraft`, `cardInConversation`, `answer`,
/// `seeInConversation` — called here against a session of the test engine instead of Claude's. That
/// reuse succeeding unchanged is the proof of S-125: the app draws a `kind` by the `kind`, never by
/// which engine sent it.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_view.dart';
import 'package:remote_claude/features/session/presentation/widgets/task_strip.dart';

import 'support/e2e_environment.dart';
import 'support/session_robot.dart';
import 'support/signed_in_app.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final E2eScenario neutral = E2eScenario.named('mobile-engine-neutral');
  final BuildConfig config = e2eConfig();
  final String agent = neutral.text('agentName');
  final String fixture = neutral.text('fixture');

  /// [target] inside the conversation.
  Finder said(Finder target) =>
      find.descendant(of: find.byType(ConversationView), matching: target);

  /// No widget of the screen ever names the engine — the literal check of S-126. Case-sensitive on
  /// purpose: the display name is always proper-cased ("Claude Code"), and this device's own
  /// ephemeral workspace sits under a path the stack names after the product itself
  /// (`/tmp/remote-claude-workspaces`) — a folder name, never the engine's, and the one place the
  /// lowercase word legitimately appears on this screen.
  void expectNoClaude() {
    expect(find.textContaining(RegExp('Claude')), findsNothing);
  }

  testWidgets('${neutral.id} — ${neutral.title}', (WidgetTester tester) async {
    final SignedInApp app = await anApprovedApp(tester, config, neutral);
    final SessionRobot robot = app.robot(tester);

    await robot.openDraft(app.container);

    // The picker exists only because this installation drives more than one engine (S-126) — on
    // the bar directly, or under its overflow on a narrow phone; `pick` finds it either way, the
    // same unmodified helper every other draft test uses for the mode, the model and the effort.
    // It starts on the installation's default — the draft never touched it.
    expect(await robot.valueOf(app.l10n.engineLabel), app.l10n.engineDefault);
    await robot.pick(app.l10n.engineLabel, agent);

    // Chosen, not yet running: the draft's own text already reads by the engine just picked, not
    // the installation's default — never a gap, never "Claude Code" (S-126).
    expect(find.text(app.l10n.draftDescription(agent)), findsOneWidget);
    expectNoClaude();

    // The same first prompt every Claude spec sends — a write, approved once — but on the test
    // engine's own scripted turn (S-125).
    final String sessionId = await robot.sentFromTheDraft('do the work [fixture:$fixture]');
    app.endsAfterTheTest(config, sessionId);

    final String requestId = await cardRequestIdOnScreen(tester, app, sessionId);

    // The card is the same one Claude's own `write_file`/`Write` turns into — the same kind, the
    // same title, the same screen (S-125).
    expect(
      find.descendant(
        of: robot.cardInConversation,
        matching: find.text(app.l10n.permissionToolFileWrite),
      ),
      findsOneWidget,
    );

    // What the test engine never announces is gone, not merely disabled (S-126): no task list for
    // an engine whose `taskList` capability is off, the same way `contextMeter` has none on the web.
    expect(find.byType(TaskStrip), findsNothing);
    expectNoClaude();

    // Approved the same way Claude's own write is: the card leaves, and the decision line says so
    // (S-125) — `SessionRobot.answer` and `seeInConversation`, unmodified.
    await robot.answer(app.l10n.permissionScopeOnce);
    await pumpUntil(tester, () => app.queueOf(sessionId).outcomeOf(requestId) != null);
    await pumpUntil(tester, () => robot.cardInConversation.evaluate().isEmpty);
    await robot.seeInConversation(said(find.text(app.l10n.permissionOutcomeAllowedPhone)));

    expectNoClaude();
  });
}

/// Plan 10, B-48 — folders and sessions on the emulator, with the browser as the second client.
///
/// The phone and the browser share the folder tabs (D-25) and the live sessions of a person: what
/// one opens, the other sees. Each test works in folders of its own, made through the backend the
/// way the browser's explorer makes them — the device has no access to the machine's disk — and
/// removed afterwards, so the sessions other suites leave in the root are never in the way.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:remote_claude/app/router_provider.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_view.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/workspace/workspace.dart';

import 'support/e2e_environment.dart';
import 'support/session_robot.dart';
import 'support/signed_in_app.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final E2eScenario scenario = E2eScenario.named('mobile-folders');
  final BuildConfig config = e2eConfig();

  /// A name no other run uses.
  String fresh(String what) => 'e2e-app-$what-${DateTime.now().microsecondsSinceEpoch}';

  /// Folders made inside the root for this test — closed and removed once it is over.
  Future<List<String>> foldersOfTheTest(SignedInApp app, String root, List<String> names) async {
    final List<String> paths = <String>[
      for (final String name in names) await app.browser.makeFolder(root, name),
    ];
    addTearDown(() async {
      for (final String name in names) {
        await app.browser.closeFolder('$root/$name');
        await app.browser.removeFolder(root, name);
      }
    });

    return paths;
  }

  /// Walks the picker from the root to [name], and taps "Open this folder" on its level.
  Future<void> openedThroughThePicker(WidgetTester tester, SignedInApp app, String name) async {
    final SessionRobot robot = app.robot(tester);
    await tester.tap((await robot.theFolders(app.container)).first);
    await pumpUntil(
      tester,
      () => find.text(app.l10n.folderPickerOpenThis).hitTestable().evaluate().isNotEmpty,
    );

    final Finder entry = find.descendant(
      of: find.byType(FolderBrowsePage),
      matching: find.widgetWithText(ListTile, name),
    );
    await tester.scrollUntilVisible(
      entry,
      200,
      scrollable: find
          .descendant(of: find.byType(FolderBrowsePage), matching: find.byType(Scrollable))
          .first,
    );
    await tester.tap(entry);
    // The folder's own level: its path on top, under the button that opens it.
    await pumpUntil(tester, () => find.textContaining(name).hitTestable().evaluate().length > 1);
    await tester.pumpAndSettle();
    await tester.tap(find.text(app.l10n.folderPickerOpenThis).hitTestable());
  }

  testWidgets(
    '${scenario.id} — S-175, S-176: a folder opened on the phone is a tab of the browser, '
    'its screen lists and attaches what the browser opened, and closing it ends nothing',
    (WidgetTester tester) async {
      final SignedInApp app = await signedInApp(tester, config, scenario);
      final String root = await app.browser.firstWorkspace();
      final String name = fresh('folder');
      final String folder = (await foldersOfTheTest(app, root, <String>[name])).single;

      // The browser opens a session in it, and has a turn.
      final (BrowserSocket browser, List<String> opened) = await aBrowserOf(config, app);
      final String sessionId = await browser.start(folder);
      opened.add(sessionId);
      await browser.turn(sessionId, scenario.text('fixture'));

      // S-175: opened on the phone, through the picker — and a tab of the browser too.
      await openedThroughThePicker(tester, app, name);
      expect(await app.robot(tester).onFolderScreen(), folder);
      expect(await app.browser.openFolders(), contains(folder));

      // S-176: the folder lists the browser's session, said to be the browser's; a tap attaches it,
      // with what was already said on screen.
      final Finder fromTheBrowser = find.widgetWithText(ListTile, app.l10n.folderOpenedFromWeb);
      await pumpUntil(tester, () => fromTheBrowser.evaluate().isNotEmpty);
      await tester.tap(fromTheBrowser);
      await pumpUntil(tester, () => app.robot(tester).sessionOnScreen == sessionId);
      await pumpUntil(
        tester,
        () => find
            .descendant(
              of: find.byType(ConversationView),
              matching: find.text(scenario.text('answer')),
            )
            .evaluate()
            .isNotEmpty,
      );

      // Closed on the phone, from the folders home: gone from both, and the session goes on.
      app.container.read(routerProvider).go(sessionRoute);
      final Finder menu = find.byTooltip(app.l10n.foldersActions(name));
      await pumpUntil(tester, () => menu.evaluate().isNotEmpty);
      await tester.pumpAndSettle();
      await tester.tap(menu);
      await tester.pumpAndSettle();
      await tester.tap(find.text(app.l10n.foldersClose));
      await pumpUntil(tester, () => find.text(app.l10n.foldersClosed).evaluate().isNotEmpty);

      expect(await app.browser.openFolders(), isNot(contains(folder)));
      expect(
        (await app.browser.liveSessions(
          folder,
        )).map((Map<String, Object?> live) => live['sessionId']),
        contains(sessionId),
      );
      expect(
        browser.frames.where((Map<String, Object?> frame) => frame['type'] == 'session.closed'),
        isEmpty,
      );
    },
  );

  testWidgets('${scenario.id} — S-177: two sessions of one folder in the side panel; a question in '
      'the one away lights its row, and switching to it lands on the card', (
    WidgetTester tester,
  ) async {
    final SignedInApp app = await signedInApp(tester, config, scenario);
    await approvedFromTheBrowser(tester, app);
    final String root = await app.browser.firstWorkspace();
    final String name = fresh('panel');
    final String folder = (await foldersOfTheTest(app, root, <String>[name])).single;
    final SessionRobot robot = app.robot(tester);

    // The first session is the browser's, attached from the folder's screen.
    final (BrowserSocket browser, List<String> opened) = await aBrowserOf(config, app);
    final String away = await browser.start(folder);
    opened.add(away);
    await openedThroughThePicker(tester, app, name);
    await robot.onFolderScreen();
    final Finder fromTheBrowser = find.widgetWithText(ListTile, app.l10n.folderOpenedFromWeb);
    await pumpUntil(tester, () => fromTheBrowser.evaluate().isNotEmpty);
    await tester.tap(fromTheBrowser);
    await pumpUntil(tester, () => robot.sessionOnScreen == away);
    await tester.pumpAndSettle();

    // The second is the phone's, from "new session" in the panel.
    final Finder panel = find.byTooltip(app.l10n.folderPanelOpen);
    await tester.tap(panel);
    await tester.pumpAndSettle();
    await tester.tap(
      find.descendant(of: find.byType(Drawer), matching: find.text(app.l10n.folderNewSession)),
    );
    await pumpUntil(tester, () => find.byType(DraftPage).evaluate().isNotEmpty);
    await tester.pumpAndSettle();
    await robot.write('do the work [fixture:${scenario.text('fixture')}]');
    await tester.tap(robot.send.first);
    await pumpUntil(
      tester,
      () =>
          robot.sessionOnScreen != null &&
          robot.sessionOnScreen != away &&
          find.byType(DraftPage).evaluate().isEmpty,
    );
    final String here = robot.sessionOnScreen!;
    app.endsAfterTheTest(config, here);
    await pumpUntil(tester, () => app.conversationOf(here).lastTurn != null);
    await tester.pumpAndSettle();

    // Both in the panel, the one on screen marked — the bar offers the panel once the screen
    // knows the folder the session runs in.
    await pumpUntil(tester, () => panel.evaluate().isNotEmpty, what: () => 'the panel button');
    await tester.tap(panel);
    await tester.pumpAndSettle();
    expect(
      find.descendant(
        of: find.byType(Drawer),
        matching: find.textContaining(app.l10n.folderPanelCurrent),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(of: find.byType(Drawer), matching: find.byType(ListTile)),
      findsNWidgets(4),
      reason: 'new session, the two sessions, and every session of the folder',
    );
    await tester.tapAt(const Offset(350, 300));
    await tester.pumpAndSettle();

    // A question in the one away: the bar's way into the panel says so.
    browser.prompt(away, scenario.text('askingFixture'));
    await pumpUntil(tester, () => app.queueOf(away).pending.isNotEmpty);
    final String requestId = app.queueOf(away).pending.single.requestId;
    final Finder lit = find.byTooltip(app.l10n.folderPanelWaitingElsewhere);
    await pumpUntil(tester, () => lit.evaluate().isNotEmpty);

    // Its row says it waits; switching lands on its card, in the place of its tool.
    await tester.tap(lit);
    await tester.pump(const Duration(milliseconds: 400));
    final Finder waitingRow = find.ancestor(
      of: find.descendant(
        of: find.byType(Drawer),
        matching: find.textContaining(app.l10n.foldersPending(1)),
      ),
      matching: find.byType(ListTile),
    );
    expect(waitingRow, findsOneWidget);
    await tester.tap(waitingRow);
    await pumpUntil(tester, () => robot.sessionOnScreen == away);
    await robot.cardOnScreen();

    // Answered there, as any other card.
    await extendedOnTheCard(tester, app, away, requestId);
    await robot.answer(app.l10n.permissionScopeOnce);
    await pumpUntil(tester, () => app.queueOf(away).outcomeOf(requestId) != null);
  });

  testWidgets(
    '${scenario.id} — S-178: past the ceiling of open folders, opening one more is refused '
    'with the ceiling and the way out',
    (WidgetTester tester) async {
      final SignedInApp app = await signedInApp(tester, config, scenario);
      final String root = await app.browser.firstWorkspace();
      final int ceiling = scenario.integer('ceiling');

      // The browser fills the tabs up to the ceiling with folders of this test; one more is left for
      // the phone to try.
      final int room = ceiling - (await app.browser.openFolders()).length;
      final String stamp = fresh('ceiling');
      final List<String> names = <String>[
        for (int index = 0; index <= room; index += 1) '$stamp-$index',
      ];
      final List<String> folders = await foldersOfTheTest(app, root, names);
      for (final String folder in folders.take(room)) {
        expect((await app.browser.openFolder(folder)).$1, inInclusiveRange(200, 201));
      }
      expect(await app.browser.openFolders(), hasLength(ceiling));
      expect(await app.browser.openFolder(folders.last), (409, scenario.text('code')));

      // The phone asks for the last one: refused, saying the ceiling and what to do — and it stays
      // where it was.
      await openedThroughThePicker(tester, app, names.last);
      await pumpUntil(
        tester,
        () => find.text(app.l10n.foldersLimitReached('$ceiling')).evaluate().isNotEmpty,
      );
      expect(find.byType(FolderPage), findsNothing);
      expect(await app.browser.openFolders(), isNot(contains(folders.last)));
    },
  );
}

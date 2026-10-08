/// Plan 22, F7, B-36 — a conversation that grows while it is read, on the emulator (S-128, S-129).
///
/// The same scenario the Playwright suite proves in the panel (`e2e/specs/live-history.spec.ts`),
/// read from the same file in `e2e/scenarios/`, and proved here through the phone's history reader.
/// The conversation is the editor's: begun elsewhere, never opened by this product, and written on
/// by the other client **while the reader is open** — through the door the scripted backend opens
/// into Claude's store ([ConversationsElsewhere]). Nothing here reads the page again: what arrives,
/// arrives by `transcript.follow`.
///
/// The steps and the texts are the scenario's: the English of each text, checked against what the
/// app's catalogue says under the key the scenario names for this end.
library;

import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:remote_claude/app/router_provider.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_view.dart';
import 'package:remote_claude/features/session/presentation/widgets/fold_line.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import 'support/conversations_elsewhere.dart';
import 'support/e2e_environment.dart';
import 'support/signed_in_app.dart';

/// One write of the other client, and what the reader shows after it.
class _Step {
  _Step(Map<String, Object?> raw)
    : name = raw['name']! as String,
      append = switch (raw['append']) {
        final Map<String, Object?> entries => (
          fixture: entries['fixture']! as String,
          from: entries['from'] as int?,
          to: entries['to'] as int?,
        ),
        _ => null,
      },
      chain = raw['chain'] as String?,
      prompt = raw['prompt'] as String?,
      answer = raw['answer'] as String?,
      said = raw['said'] as String?,
      gone = raw['gone'] as String?,
      newer = raw['newer'] as int?,
      working = raw['working']! as bool;

  final String name;
  final RecordedEntries? append;
  final String? chain;
  final String? prompt;
  final String? answer;
  final String? said;
  final String? gone;
  final int? newer;
  final bool working;
}

/// What the app's catalogue says under each key the scenario names — the only way to reach a key by
/// its name, since the generated catalogue has a getter per key and no lookup.
final Map<String, String Function(AppLocalizations l10n, Map<String, Object?> params)> _catalogue =
    <String, String Function(AppLocalizations, Map<String, Object?>)>{
      'historyActiveElsewhereNote': (AppLocalizations l10n, _) => l10n.historyActiveElsewhereNote,
      'historyFollowWorking': (AppLocalizations l10n, _) => l10n.historyFollowWorking,
      'historyFollowNewer': (AppLocalizations l10n, Map<String, Object?> params) =>
          l10n.historyFollowNewer(params['count']! as int),
      'historyFollowNewerLabel': (AppLocalizations l10n, Map<String, Object?> params) =>
          l10n.historyFollowNewerLabel(params['newer']! as String),
      'sessionToolTitled': (AppLocalizations l10n, Map<String, Object?> params) =>
          l10n.sessionToolTitled(params['name']! as String, params['title']! as String),
      'historyResumeAction': (AppLocalizations l10n, _) => l10n.historyResumeAction,
      'sessionForkTitle': (AppLocalizations l10n, _) => l10n.sessionForkTitle,
      'sessionForkCancel': (AppLocalizations l10n, _) => l10n.sessionForkCancel,
    };

/// A conversation id of the shape Claude mints — a random UUID.
String _aConversationId() {
  final Random random = Random.secure();
  final List<int> bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final String hex = bytes.map((int byte) => byte.toRadixString(16).padLeft(2, '0')).join();

  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-'
      '${hex.substring(16, 20)}-${hex.substring(20)}';
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final BuildConfig config = e2eConfig();
  final E2eScenario live = E2eScenario.named('live-history');
  final Map<String, Object?> planted = live.expect['planted']! as Map<String, Object?>;
  final List<_Step> steps = (live.expect['steps']! as List<Object?>)
      .map((Object? step) => _Step(step! as Map<String, Object?>))
      .toList();
  final Map<String, Object?> texts = live.expect['texts']! as Map<String, Object?>;
  final ConversationsElsewhere door = ConversationsElsewhere(config);

  /// A step of the scenario, by its name.
  _Step step(String name) => steps.firstWhere(
    (_Step each) => each.name == name,
    orElse: () => throw StateError('live-history.json has no step $name'),
  );

  /// The text [name] of the scenario, in English — after checking the app says the same under the
  /// key the scenario names for it.
  String text(AppLocalizations l10n, String name) {
    final Map<String, Object?> entry = texts[name]! as Map<String, Object?>;
    final String key = entry['app']! as String;
    final String english = entry['en']! as String;
    final String said = _catalogue[key]!(
      l10n,
      (entry['params'] as Map<String, Object?>?) ?? const <String, Object?>{},
    );

    expect(said, english, reason: 'the app says $key as live-history.json does');
    return said;
  }

  /// [target] on the history screen.
  Finder onReader(Finder target) =>
      find.descendant(of: find.byType(ConversationHistoryPage), matching: target);

  /// [target] in the conversation the reader shows.
  Finder inConversation(Finder target) =>
      find.descendant(of: onReader(find.byType(ConversationView)), matching: target);

  /// The one part of the reader that scrolls — the conversation.
  Finder scroller() => inConversation(find.byType(Scrollable)).first;

  /// Whether [target] is drawn inside what the conversation shows — not built at all is not.
  bool inView(WidgetTester tester, Finder target) {
    if (target.evaluate().isEmpty) {
      return false;
    }
    final Rect view = tester.getRect(scroller());
    final Rect box = tester.getRect(target.first);
    return box.bottom > view.top && box.top < view.bottom;
  }

  /// Pumps until [target] is on the reader — or, with [present] false, is not.
  Future<void> seen(WidgetTester tester, Finder target, {bool present = true}) => pumpUntil(
    tester,
    () => target.evaluate().isNotEmpty == present,
    what: () => '${present ? '' : 'no '}$target on the reader',
  );

  /// What the other client writes in [name]: entries at the end, or a chain compacted.
  Future<_Step> writes(String conversationId, String name) async {
    final _Step written = step(name);
    final RecordedEntries? entries = written.append;
    final String? chain = written.chain;

    if (entries != null) {
      await door.append(conversationId, entries);
    }
    if (chain != null) {
      await door.compact(conversationId, chain);
    }
    return written;
  }

  /// "Working in another client…" on the reader after [after], or not, as the scenario says.
  Future<void> workingAsSaid(WidgetTester tester, AppLocalizations l10n, _Step after) =>
      seen(tester, onReader(find.text(text(l10n, 'working'))), present: after.working);

  /// Plants the conversation in a folder of its own — made for the test inside the first root, and
  /// gone after it — and opens it in the reader, with what was already said on screen.
  ///
  /// @returns the id of the conversation, and the folder it runs in
  Future<(String, String)> readerOfOneWrittenElsewhere(WidgetTester tester, SignedInApp app) async {
    final String root = await app.browser.firstWorkspace();
    final String name = 'e2e-live-${DateTime.now().microsecondsSinceEpoch}';
    final String folder = await app.browser.makeFolder(root, name);
    addTearDown(() => app.browser.removeFolder(root, name));

    final String conversationId = _aConversationId();
    await door.plant(
      conversationId: conversationId,
      cwd: folder,
      fixture: planted['fixture']! as String,
      title: planted['title']! as String,
    );

    app.container.read(routerProvider).go(conversationRouteFor(conversationId, folder));
    await seen(tester, inConversation(find.textContaining(planted['answer']! as String)));
    return (conversationId, folder);
  }

  testWidgets(
    '${live.id} — the conversation grows in the reader without reading it again, with the notice '
    'and "working in another client" coming and going; scrolled up it is "N new", which leads to '
    'the end; a rewritten chain is read again and still followed (S-128)',
    (WidgetTester tester) async {
      final SignedInApp app = await anApprovedApp(tester, config, live);
      final AppLocalizations l10n = app.l10n;
      final (String conversationId, _) = await readerOfOneWrittenElsewhere(tester, app);
      final State<ConversationHistoryPage> reader = tester.state(
        find.byType(ConversationHistoryPage),
      );

      expect(onReader(find.text(text(l10n, 'activeElsewhere'))), findsOneWidget);
      expect(onReader(find.text(text(l10n, 'working'))), findsNothing);

      // A prompt and the call it made — the turn is open elsewhere.
      final String bashTitle = text(l10n, 'bashTitle');
      Finder bashStatus(String status) => find.descendant(
        of: find.ancestor(
          of: inConversation(find.text(bashTitle)),
          matching: find.byType(FoldLine),
        ),
        matching: find.text(status),
      );
      final _Step asks = await writes(conversationId, 'asks');
      await seen(tester, inConversation(find.text(asks.prompt!)));
      await seen(tester, bashStatus(l10n.sessionToolStatusRunning));
      await workingAsSaid(tester, l10n, asks);

      // Its result and the answer: the turn closed, and the inference goes with it.
      final _Step answers = await writes(conversationId, 'answers');
      await seen(tester, inConversation(find.text(answers.answer!)));
      await seen(tester, bashStatus(l10n.sessionToolStatusSucceeded));
      await workingAsSaid(tester, l10n, answers);

      // Scrolled up to read, what arrives is counted, not scrolled to.
      final ScrollPosition position = tester.state<ScrollableState>(scroller()).position;
      expect(position.maxScrollExtent, greaterThan(0), reason: 'the conversation overflows');
      position.jumpTo(0);
      await tester.pump();

      final _Step newer = await writes(conversationId, 'newer');
      final Finder pill = inConversation(find.widgetWithText(UnseenPill, text(l10n, 'newer')));
      await seen(tester, pill);
      expect(
        tester.widget<UnseenPill>(pill).count,
        newer.newer,
        reason: 'the pill counts what arrived',
      );
      expect(
        find.descendant(of: pill, matching: find.byTooltip(text(l10n, 'newerLabel'))),
        findsOneWidget,
      );
      final Finder newerAnswer = inConversation(find.text(newer.answer!));
      expect(inView(tester, newerAnswer), isFalse, reason: 'what arrived is not scrolled to');

      await tester.tap(pill);
      await seen(tester, pill, present: false);
      await pumpUntil(
        tester,
        () => inView(tester, newerAnswer),
        what: () => '${newer.answer} in view after the pill',
      );
      await workingAsSaid(tester, l10n, newer);

      // Compacted elsewhere — none of what the reader had is on the chain any more.
      final _Step rewritten = await writes(conversationId, 'rewritten');
      await seen(tester, inConversation(find.textContaining(rewritten.said!)));
      await seen(tester, inConversation(find.text(rewritten.gone!)), present: false);
      expect(inConversation(find.textContaining(planted['answer']! as String)), findsNothing);
      // The chain ends on what the compaction wrote as the person's: the turn is open again.
      await workingAsSaid(tester, l10n, rewritten);

      // ...and the reader follows the new chain.
      final _Step after = await writes(conversationId, 'after');
      await seen(tester, inConversation(find.text(after.prompt!)));
      await seen(tester, inConversation(find.text(after.answer!)));
      await workingAsSaid(tester, l10n, after);

      expect(
        tester.state(find.byType(ConversationHistoryPage)),
        same(reader),
        reason: 'the reader was never opened again',
      );
    },
  );

  testWidgets(
    '${live.id} — "Continue this conversation", on one being written elsewhere, asks before the '
    'copy; cancelled, nothing is continued (S-129)',
    (WidgetTester tester) async {
      final SignedInApp app = await anApprovedApp(tester, config, live);
      final AppLocalizations l10n = app.l10n;
      final (String conversationId, String folder) = await readerOfOneWrittenElsewhere(tester, app);
      expect(onReader(find.text(text(l10n, 'activeElsewhere'))), findsOneWidget);

      await tapOnScreen(tester, onReader(find.text(text(l10n, 'resume'))));
      final Finder dialog = find.byType(AlertDialog);
      await seen(tester, find.descendant(of: dialog, matching: find.text(text(l10n, 'forkTitle'))));

      await tester.tap(find.descendant(of: dialog, matching: find.text(text(l10n, 'forkCancel'))));
      await seen(tester, dialog, present: false);

      // Nothing left: no command pending, no session continuing it, and the reader still open.
      expect(app.container.read(resumeControllerProvider(conversationId)), const ResumeState());
      expect(await app.browser.liveSessions(folder), isEmpty);
      expect(find.byType(ConversationHistoryPage), findsOneWidget);
    },
  );
}

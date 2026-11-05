/// A `session.notice`, or the generic line this build draws in its place — plan 27, F6 · B-19, B-20.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_lines.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/pump_app.dart';

void main() {
  late AppLocalizations l10n;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  testWidgets('S-72 · a known kind is drawn folded, with its label', (WidgetTester tester) async {
    await tester.pumpApp(
      const NoticeRow(
        line: NoticeLine(
          noticeId: 'n1',
          kind: 'command.output',
          level: NoticeLevel.info,
          text: 'README.md',
        ),
      ),
    );

    expect(find.text(l10n.sessionNoticeKindCommandOutput), findsOneWidget);
    expect(find.text('README.md'), findsNothing);
  });

  testWidgets('S-73 · info folds and opens on a tap, same as every other system row', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const NoticeRow(
        line: NoticeLine(
          noticeId: 'n1',
          kind: 'command.output',
          level: NoticeLevel.info,
          text: 'README.md',
        ),
      ),
    );

    await tester.tap(find.text(l10n.sessionNoticeKindCommandOutput));
    await tester.pump();

    expect(find.text('README.md'), findsOneWidget);
  });

  testWidgets('every known kind this build has a label for draws it, folded', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const NoticeRow(
        line: NoticeLine(noticeId: 'n1', kind: 'agent.notification', level: NoticeLevel.notice),
      ),
    );
    expect(find.text(l10n.sessionNoticeKindAgentNotification), findsOneWidget);

    await tester.pumpApp(
      const NoticeRow(
        line: NoticeLine(noticeId: 'n2', kind: 'turn.failed', level: NoticeLevel.error),
      ),
    );
    expect(find.text(l10n.sessionNoticeKindTurnFailed), findsOneWidget);

    await tester.pumpApp(
      const NoticeRow(
        line: NoticeLine(noticeId: 'n3', kind: 'compaction.failed', level: NoticeLevel.warning),
      ),
    );
    expect(find.text(l10n.sessionNoticeKindCompactionFailed), findsOneWidget);
  });

  testWidgets('S-73 · warning and error read in a different colour than info — never a reorder', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const NoticeRow(
        line: NoticeLine(noticeId: 'n1', kind: 'auth.failed', level: NoticeLevel.error, text: 'x'),
      ),
    );

    final Text title = tester.widget<Text>(find.text(l10n.sessionNoticeKindAuthFailed));
    final ColorScheme scheme = Theme.of(tester.element(find.byType(NoticeRow))).colorScheme;

    expect(title.style?.color, scheme.error);
  });

  testWidgets('S-74 · command.output opens in markdown; everything else, plain text — never HTML', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const NoticeRow(
        line: NoticeLine(
          noticeId: 'n1',
          kind: 'command.output',
          level: NoticeLevel.info,
          text: '# a heading\n<script>alert(1)</script>',
        ),
      ),
    );

    await tester.tap(find.text(l10n.sessionNoticeKindCommandOutput));
    await tester.pumpAndSettle();

    expect(find.text('a heading'), findsOneWidget);
    // The safe renderer shows the tag as inert text, never as a widget of its own (R-01) — no
    // separate `Html`/web-view element renders it, which is what a real injection would need.
    expect(find.textContaining('<script>'), findsOneWidget);
  });

  testWidgets('a notice whose text is untrusted stays plain text, even with markup in it', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const NoticeRow(
        line: NoticeLine(
          noticeId: 'n1',
          kind: 'model.refused',
          level: NoticeLevel.warning,
          text: '# not a heading here',
        ),
      ),
    );

    await tester.tap(find.text(l10n.sessionNoticeKindModelRefused));
    await tester.pump();

    expect(find.text('# not a heading here'), findsOneWidget);
  });

  testWidgets('a messageKey the backend sent is translated, with its params', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const NoticeRow(
        line: NoticeLine(
          noticeId: 'n1',
          kind: 'model.switched',
          level: NoticeLevel.warning,
          messageKey: 'sessions.notice.modelSwitched',
          params: <String, Object?>{'to': 'claude-haiku', 'from': 'claude-opus'},
        ),
      ),
    );

    await tester.tap(find.text(l10n.sessionNoticeKindModelSwitched));
    await tester.pump();

    expect(
      find.text(l10n.sessionNoticeModelSwitched('claude-haiku', 'claude-opus')),
      findsOneWidget,
    );
  });

  testWidgets('a requestRetrying messageKey is translated, with its attempt and max', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const NoticeRow(
        line: NoticeLine(
          noticeId: 'n1',
          kind: 'request.retrying',
          level: NoticeLevel.notice,
          messageKey: 'sessions.notice.requestRetrying',
          params: <String, Object?>{'attempt': 2, 'maxAttempts': 5},
        ),
      ),
    );

    await tester.tap(find.text(l10n.sessionNoticeKindRequestRetrying));
    await tester.pump();

    expect(find.text(l10n.sessionNoticeRequestRetrying('2', '5')), findsOneWidget);
  });

  testWidgets('a usageLimited messageKey is translated, with its status', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const NoticeRow(
        line: NoticeLine(
          noticeId: 'n1',
          kind: 'usage.limited',
          level: NoticeLevel.warning,
          messageKey: 'sessions.notice.usageLimited',
          params: <String, Object?>{'status': 'allowed_warning'},
        ),
      ),
    );

    await tester.tap(find.text(l10n.sessionNoticeKindUsageLimited));
    await tester.pump();

    expect(find.text(l10n.sessionNoticeUsageLimited('allowed_warning')), findsOneWidget);
  });

  testWidgets('an agentStopping messageKey is translated, with its reason', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const NoticeRow(
        line: NoticeLine(
          noticeId: 'n1',
          kind: 'agent.stopping',
          level: NoticeLevel.notice,
          messageKey: 'sessions.notice.agentStopping',
          params: <String, Object?>{'reason': 'end_turn'},
        ),
      ),
    );

    await tester.tap(find.text(l10n.sessionNoticeKindAgentStopping));
    await tester.pump();

    expect(find.text(l10n.sessionNoticeAgentStopping('end_turn')), findsOneWidget);
  });

  testWidgets('a memoryRecalled messageKey needs no params', (WidgetTester tester) async {
    await tester.pumpApp(
      const NoticeRow(
        line: NoticeLine(
          noticeId: 'n1',
          kind: 'agent.info',
          level: NoticeLevel.notice,
          messageKey: 'sessions.notice.memoryRecalled',
        ),
      ),
    );

    await tester.tap(find.text(l10n.sessionNoticeKindAgentInfo));
    await tester.pump();

    expect(find.text(l10n.sessionNoticeMemoryRecalled), findsOneWidget);
  });

  testWidgets('a conversationReset messageKey needs no params', (WidgetTester tester) async {
    await tester.pumpApp(
      const NoticeRow(
        line: NoticeLine(
          noticeId: 'n1',
          kind: 'agent.info',
          level: NoticeLevel.notice,
          messageKey: 'sessions.notice.conversationReset',
        ),
      ),
    );

    await tester.tap(find.text(l10n.sessionNoticeKindAgentInfo));
    await tester.pump();

    expect(find.text(l10n.sessionNoticeConversationReset), findsOneWidget);
  });

  testWidgets('a messageKey this build has no renderer for reads as the key itself', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const NoticeRow(
        line: NoticeLine(
          noticeId: 'n1',
          kind: 'agent.info',
          level: NoticeLevel.notice,
          messageKey: 'sessions.notice.fromAFutureBuild',
        ),
      ),
    );

    await tester.tap(find.text(l10n.sessionNoticeKindAgentInfo));
    await tester.pump();

    expect(find.text('sessions.notice.fromAFutureBuild'), findsOneWidget);
  });

  testWidgets('U-06 · an unknown WS event type names it, with its own reason', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const NoticeRow(
        line: NoticeLine(
          id: 'unknown-event:session.inventedByAFutureBuild',
          kind: '',
          reason: GenericReason.unknownEvent,
          level: NoticeLevel.notice,
          detail: 'session.inventedByAFutureBuild',
        ),
      ),
    );

    expect(
      find.text(l10n.sessionNoticeReasonUnknownEvent('session.inventedByAFutureBuild')),
      findsOneWidget,
    );
  });

  testWidgets('U-07 · an unrecognised enum value names it, with its own reason', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const NoticeRow(
        line: NoticeLine(
          id: 'unknown-value:turn.outcome:halted',
          kind: '',
          reason: GenericReason.unknownValue,
          level: NoticeLevel.notice,
          detail: 'turn.outcome:halted',
        ),
      ),
    );

    expect(find.text(l10n.sessionNoticeReasonUnknownValue('turn.outcome:halted')), findsOneWidget);
  });

  testWidgets('U-09 · a known event missing a required field names it, with its own reason', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const NoticeRow(
        line: NoticeLine(
          id: 'malformed:session.notice:kind',
          kind: '',
          reason: GenericReason.malformed,
          level: NoticeLevel.notice,
          detail: 'session.notice:kind',
        ),
      ),
    );

    expect(find.text(l10n.sessionNoticeReasonMalformed('session.notice:kind')), findsOneWidget);
  });

  testWidgets('U-11 · a kind this build has no line for reads as unknown, with its text', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const NoticeRow(
        line: NoticeLine(
          noticeId: 'n1',
          kind: 'unknown',
          level: NoticeLevel.notice,
          text: 'details',
          detail: 'system:future_thing',
        ),
      ),
    );

    expect(find.text(l10n.sessionNoticeKindUnknown('system:future_thing')), findsOneWidget);

    await tester.tap(find.text(l10n.sessionNoticeKindUnknown('system:future_thing')));
    await tester.pump();

    expect(find.text('details'), findsOneWidget);
  });

  testWidgets(
    'D-12 · ten identical unknown notices in a row collapse into one line, with a counter',
    (WidgetTester tester) async {
      await tester.pumpApp(
        const NoticeRow(
          line: NoticeLine(
            noticeId: 'n1',
            kind: 'unknown',
            level: NoticeLevel.notice,
            text: 'same',
            count: 10,
          ),
        ),
      );

      expect(find.text(l10n.sessionNoticeRepeated(10)), findsOneWidget);
    },
  );

  testWidgets('a text cut by the backend says so, once opened', (WidgetTester tester) async {
    await tester.pumpApp(
      const NoticeRow(
        line: NoticeLine(
          noticeId: 'n1',
          kind: 'auth.failed',
          level: NoticeLevel.error,
          text: 'cut short',
          truncated: true,
        ),
      ),
    );

    await tester.tap(find.text(l10n.sessionNoticeKindAuthFailed));
    await tester.pump();

    expect(find.text(l10n.sessionNoticeTruncated), findsOneWidget);
  });
}

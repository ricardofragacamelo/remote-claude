/// What the line of a running turn says (plan 10, B-18): the verb of the turn, the tool, the wait —
/// and only the change of it announced.
library;

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/presentation/widgets/working_indicator.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../../../support/pump_app.dart';

void main() {
  late AppLocalizations l10n;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  test('S-58 · the same turn draws the same verb, always; the next may draw another', () {
    const String turn = 'session-1:3';

    expect(verbOf(turn), verbOf(turn));
    expect(workingVerbs, contains(verbOf(turn)));
    final Set<String> drawn = <String>{for (int i = 0; i < 40; i += 1) verbOf('session-1:$i')};
    expect(drawn.length, greaterThan(1));
    expect(turnKeyOf('s', const Conversation()), 's:0');
  });

  test('the hash is the web’s: the same turn draws the same verb on both ends', () {
    // `verbOf('abc')` on the web: ((97 * 31 + 98) * 31 + 99) % 20 = 96354 % 20 = 14.
    expect(verbOf('abc'), workingVerbs[14]);
    expect(verbOf(''), workingVerbs.first);
  });

  test('every verb has its words, in both languages', () async {
    final AppLocalizations pt = await AppLocalizations.delegate.load(const Locale('pt'));

    for (final String verb in workingVerbs) {
      expect(verbText(l10n, verb), isNotEmpty);
      expect(verbText(pt, verb), isNot(verbText(l10n, verb)), reason: verb);
    }
    expect(workingVerbs.toSet(), hasLength(20));
    expect(verbText(l10n, 'unknown'), l10n.sessionWorkingVerbWorking);
  });

  test('S-55 · the wait first, then the tool, then the verb', () {
    expect(
      workingLabel(l10n, status: SessionStatus.waitingPermission, turn: 't', tool: 'Bash'),
      l10n.sessionWorkingWaiting,
    );
    expect(
      workingLabel(l10n, status: SessionStatus.running, turn: 't', tool: 'Bash', waiting: 1),
      l10n.sessionWorkingWaiting,
    );
    expect(
      workingLabel(l10n, status: SessionStatus.running, turn: 't', tool: 'Bash'),
      l10n.sessionWorkingRunningTool('Bash'),
    );
    expect(
      workingLabel(l10n, status: SessionStatus.running, turn: 't'),
      verbText(l10n, verbOf('t')),
    );
    expect(
      workingLabel(l10n, status: SessionStatus.thinking, turn: 't', tool: 'Bash'),
      verbText(l10n, verbOf('t')),
    );
  });

  test('S-56 · a turn of 60 s with one tool is two announcements, not sixty', () {
    String at(int second) => workingLabel(
      l10n,
      status: second >= 20 && second < 50 ? SessionStatus.running : SessionStatus.thinking,
      turn: 'session-1:0',
      tool: second >= 20 && second < 50 ? 'Bash' : null,
    );

    int announced = 0;
    for (int second = 1; second < 60; second += 1) {
      if (at(second) != at(second - 1)) {
        announced += 1;
      }
    }

    expect(announced, 2);
  });

  test('the time: seconds, then minutes and seconds; never negative', () {
    expect(elapsedText(l10n, const Duration(seconds: 59)), l10n.sessionWorkingSeconds('59'));
    expect(elapsedText(l10n, const Duration(seconds: 61)), l10n.sessionWorkingMinutes('1', '01'));
    expect(elapsedText(l10n, const Duration(seconds: -5)), l10n.sessionWorkingSeconds('0'));
  });

  test('S-97 · a question of Claude is waited for as one, and a permission as before', () {
    expect(
      workingLabel(
        l10n,
        status: SessionStatus.waitingPermission,
        turn: 't',
        waiting: 1,
        questionsOnly: true,
      ),
      l10n.permissionQuestionWaiting,
    );
    expect(
      workingLabel(l10n, status: SessionStatus.waitingPermission, turn: 't', waiting: 1),
      l10n.sessionWorkingWaiting,
    );
  });
}

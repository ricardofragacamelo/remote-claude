import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_event.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_outcome.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_queue.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';

import '../../../../../support/builders/permissions.dart';

void main() {
  final PermissionRequest request = aPermissionRequest();
  final PermissionQueue empty = PermissionQueue(asOf: t0);
  final PermissionQueue open = empty.apply(asked(request));

  group('a question arriving', () {
    test('puts its card on screen, answerable by its frame', () {
      final PermissionCard card = open.cardOf('request-1')!;

      expect(card.frameId, 'frame-1');
      expect(card.phase, CardPhase.idle);
      expect(card.isAnswerable, isTrue);
    });

    // A reconnect republishes what is still open. The same question twice is one card, and it
    // keeps where it was — an answer already on its way stays on its way.
    test('asked again keeps its place and phase, under the new frame', () {
      final PermissionQueue again = open
          .apply(asked(aPermissionRequest(requestId: 'request-2')))
          .markSending('request-1')
          .apply(asked(request, frameId: 'frame-9'));

      expect(again.pending.map((PermissionCard card) => card.requestId), <String>[
        'request-1',
        'request-2',
      ]);
      expect(again.cardOf('request-1')!.phase, CardPhase.sending);
      expect(again.cardOf('request-1')!.frameId, 'frame-9');
    });

    test('that already ended does not come back', () {
      final PermissionQueue ended = open.apply(settled('request-1')).apply(asked(request));

      expect(ended.pending, isEmpty);
    });
  });

  // S-49 — answered somewhere else, the card leaves on its own, saying who won.
  group('a settlement', () {
    test('removes the card and records how it ended', () {
      final PermissionQueue ended = open.apply(settled('request-1', origin: AnswerOrigin.web));

      expect(ended.cardOf('request-1'), isNull);
      expect(ended.outcomeOf('request-1')!.origin, AnswerOrigin.web);
      expect(ended.lastOutcome, ended.outcomeOf('request-1'));
    });

    test('of a request never shown is still recorded', () {
      expect(empty.apply(settled('request-7')).outcomeOf('request-7'), isNotNull);
    });

    test('arriving twice is recorded once', () {
      final PermissionQueue twice = open.apply(settled('request-1')).apply(settled('request-1'));

      expect(twice.settled, hasLength(1));
    });

    test('nothing ended yet is no outcome at all', () {
      expect(empty.lastOutcome, isNull);
      expect(empty.outcomeOf('request-1'), isNull);
    });
  });

  group('the deadline', () {
    test('moves when somebody extends it, and so does what is left of the ceiling', () {
      final PermissionQueue moved = open.apply(
        PermissionDeadlineMoved(
          requestId: 'request-1',
          expiresAt: t0.add(const Duration(minutes: 5)),
          remainingExtensions: 2,
        ),
      );

      final PermissionCard card = moved.cardOf('request-1')!;
      expect(card.request.expiresAt, t0.add(const Duration(minutes: 5)));
      expect(card.remainingExtensions, 2);
      expect(card.isExtendable, isTrue);
    });

    // S-65 — the ceiling takes the action away, and the card says why.
    test('reaching the ceiling stops the card being extendable', () {
      final PermissionQueue capped = open.apply(
        const PermissionExtensionRefused(requestId: 'request-1', refusal: ExtensionRefusal.ceiling),
      );

      expect(capped.cardOf('request-1')!.isExtendable, isFalse);
      expect(capped.cardOf('request-1')!.extensionRefused, isTrue);
    });

    test('with no extension left is not extendable either', () {
      final PermissionQueue last = open.apply(
        PermissionDeadlineMoved(requestId: 'request-1', expiresAt: t0, remainingExtensions: 0),
      );

      expect(last.cardOf('request-1')!.isExtendable, isFalse);
    });

    // S-66 — extending something over neither revives it nor rewrites it.
    test('refused because it was over changes nothing', () {
      final PermissionQueue ended = open.apply(settled('request-1'));

      expect(
        ended.apply(
          const PermissionExtensionRefused(requestId: 'request-1', refusal: ExtensionRefusal.over),
        ),
        ended,
      );
      expect(
        ended.apply(
          PermissionDeadlineMoved(requestId: 'request-1', expiresAt: t0, remainingExtensions: 1),
        ),
        ended,
      );
    });

    // S-81 — silence refuses: the card leaves as refused, with nobody asked to confirm.
    test('reached on screen lets the card go as refused by the deadline', () {
      final PermissionQueue before = open.tick(
        request.expiresAt.subtract(const Duration(milliseconds: 1)),
      );
      final PermissionQueue after = open.tick(request.expiresAt);

      expect(before.cardOf('request-1'), isNotNull);
      expect(after.cardOf('request-1'), isNull);
      expect(after.outcomeOf('request-1'), const PermissionOutcome.expired('request-1'));
      expect(after.asOf, request.expiresAt);
    });
  });

  group('answering', () {
    // S-41 — one tap on a destructive yes is not a yes.
    test('a destructive yes asks for its second step first', () {
      expect(
        open.stepFor('request-1', PermissionDecision.allow, PermissionScope.once),
        AnswerStep.confirm,
      );
    });

    test('after the first step, the yes may go', () {
      expect(
        open.arm('request-1').stepFor('request-1', PermissionDecision.allow, PermissionScope.once),
        AnswerStep.send,
      );
    });

    test('backing out of the second step asks for it again', () {
      expect(
        open
            .arm('request-1')
            .disarm('request-1')
            .stepFor('request-1', PermissionDecision.allow, PermissionScope.once),
        AnswerStep.confirm,
      );
    });

    test('a refusal never waits for a second step', () {
      expect(
        open.stepFor('request-1', PermissionDecision.deny, PermissionScope.once),
        AnswerStep.send,
      );
    });

    test('a yes to something that is not destructive goes in one step', () {
      final PermissionQueue writing = empty.apply(
        asked(aPermissionRequest(riskHint: RiskHint.write)),
      );

      expect(
        writing.stepFor('request-1', PermissionDecision.allow, PermissionScope.once),
        AnswerStep.send,
      );
    });

    // S-48 — two taps are two answers, so the second one is nothing.
    test('a card that is sending takes no second tap', () {
      final PermissionQueue sending = open.markSending('request-1');

      expect(
        sending.stepFor('request-1', PermissionDecision.deny, PermissionScope.once),
        AnswerStep.ignored,
      );
      expect(sending.cardOf('request-1')!.isAnswerable, isFalse);
    });

    // S-87 — an answer that never left gives the card back.
    test('an answer that did not leave releases the card', () {
      final PermissionQueue released = open.markSending('request-1').release('request-1');

      expect(
        released.stepFor('request-1', PermissionDecision.deny, PermissionScope.once),
        AnswerStep.send,
      );
    });

    test('a card known only from the revalidation cannot answer yet', () {
      final PermissionQueue seeded = empty.seed(request);

      expect(seeded.cardOf('request-1')!.frameId, isNull);
      expect(
        seeded.stepFor('request-1', PermissionDecision.deny, PermissionScope.once),
        AnswerStep.ignored,
      );
    });

    // S-65 — "don't ask me again" in one tap is the same accident as `rm -rf` in one tap.
    test('a yes that persists a rule asks for its second step, whatever the risk', () {
      final PermissionQueue reading = empty.apply(
        asked(aPermissionRequest(riskHint: RiskHint.read)),
      );

      for (final PermissionScope scope in <PermissionScope>[
        PermissionScope.project,
        PermissionScope.always,
      ]) {
        expect(reading.stepFor('request-1', PermissionDecision.allow, scope), AnswerStep.confirm);
        expect(
          reading.arm('request-1').stepFor('request-1', PermissionDecision.allow, scope),
          AnswerStep.send,
        );
      }
      expect(
        reading.stepFor('request-1', PermissionDecision.allow, PermissionScope.session),
        AnswerStep.send,
      );
    });

    test('a request that is not on screen is ignored', () {
      expect(
        empty.stepFor('request-1', PermissionDecision.deny, PermissionScope.once),
        AnswerStep.ignored,
      );
      expect(empty.markSending('request-1'), empty);
    });
  });

  group('the revalidation', () {
    test('puts a card on screen with what is known about its extensions', () {
      final PermissionQueue seeded = empty.seed(request, remainingExtensions: 3);

      expect(seeded.cardOf('request-1')!.remainingExtensions, 3);
    });

    test('never replaces what the stream already said', () {
      expect(open.seed(aPermissionRequest(description: 'other')), open);
    });

    test('never brings back something that ended', () {
      final PermissionQueue ended = open.apply(settled('request-1'));

      expect(ended.seed(request), ended);
    });

    test('is answerable once the socket re-delivers the question', () {
      final PermissionQueue delivered = empty.seed(request).apply(asked(request));

      expect(delivered.cardOf('request-1')!.isAnswerable, isTrue);
      expect(delivered.pending, hasLength(1));
    });
  });

  test('a replay gap drops everything, and keeps the clock', () {
    final PermissionQueue reset = open
        .apply(settled('request-2'))
        .apply(const PermissionFeedReset());

    expect(reset.pending, isEmpty);
    expect(reset.settled, isEmpty);
    expect(reset.asOf, t0);
  });
}

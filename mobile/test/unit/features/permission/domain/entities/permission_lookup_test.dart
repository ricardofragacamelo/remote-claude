import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_lookup.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_outcome.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_queue.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';

import '../../../../../support/builders/permissions.dart';

void main() {
  final PermissionRequest request = aPermissionRequest();
  final PermissionQueue empty = PermissionQueue(asOf: t0);
  final PermissionQueue open = empty.apply(asked(request));

  PermissionFocus focus(PermissionLookup? lookup, PermissionQueue queue) =>
      focusOf(lookup: lookup, queue: queue, requestId: 'request-1');

  // S-45 — nothing about the request is shown before the server has answered. Not even when the
  // socket was faster: the fast case is not an exception to the rule.
  test('before the server answers, the screen is checking — even with the card in the queue', () {
    expect(focus(null, empty), const FocusChecking());
    expect(focus(null, open), const FocusChecking());
  });

  group('once the server answered', () {
    test('a pending request is its card', () {
      expect(focus(LookupPending(request, remainingExtensions: 2), empty), isA<FocusOpen>());
      expect(
        (focus(LookupPending(request, remainingExtensions: 2), empty) as FocusOpen)
            .card
            .remainingExtensions,
        2,
      );
    });

    // S-46 — already answered: how it ended, never a card to answer.
    test('a settled request is how it ended', () {
      const PermissionOutcome outcome = PermissionOutcome(
        requestId: 'request-1',
        decision: PermissionDecision.deny,
        auto: false,
        origin: AnswerOrigin.web,
      );

      expect(focus(const LookupSettled(outcome), empty), const FocusSettled(outcome));
    });

    // S-57 — a notification opened after the deadline is not an actionable card.
    test('an expired request is the deadline refusing it', () {
      expect(
        focus(const LookupExpired(), empty),
        const FocusSettled(PermissionOutcome.expired('request-1')),
      );
    });

    test('a request the server forgot is gone', () {
      expect(focus(const LookupGone(), empty), const FocusGone());
    });
  });

  group('what the stream said since wins over the answer', () {
    // S-49 — answered on the web while this screen was open.
    test('a settlement after a pending answer shows how it ended', () {
      final PermissionQueue ended = open.apply(settled('request-1'));

      expect(focus(LookupPending(request), ended), isA<FocusSettled>());
    });

    test('the live card replaces the one the answer described', () {
      final PermissionFocus shown = focus(LookupPending(request), open);

      expect((shown as FocusOpen).card.frameId, 'frame-1');
    });

    test('a request asked again after the server said it expired is its card', () {
      expect(focus(const LookupGone(), open), isA<FocusOpen>());
    });
  });

  // Built at run time: identical `const` values are one instance, and comparing them would answer
  // by identity without the value equality ever running.
  group('the answers and the views compare by value', () {
    PermissionOutcome outcome(String requestId) =>
        PermissionOutcome(requestId: requestId, decision: PermissionDecision.allow, auto: false);

    test('the server answers', () {
      expect(
        LookupPending(request, remainingExtensions: 1),
        LookupPending(request, remainingExtensions: 1),
      );
      expect(LookupPending(request), isNot(LookupPending(request, remainingExtensions: 1)));
      expect(LookupSettled(outcome('a')), LookupSettled(outcome('a')));
      expect(LookupSettled(outcome('a')), isNot(LookupSettled(outcome('b'))));
      expect(<Object?>[...const LookupExpired().props, ...const LookupGone().props], isEmpty);
    });

    test('what the screen shows', () {
      final PermissionCard card = open.cardOf('request-1')!;

      expect(FocusOpen(card), FocusOpen(card));
      expect(FocusSettled(outcome('a')), FocusSettled(outcome('a')));
      expect(<Object?>[...const FocusChecking().props, ...const FocusGone().props], isEmpty);
    });
  });
}

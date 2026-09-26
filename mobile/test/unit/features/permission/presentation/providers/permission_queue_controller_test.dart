/// The permission queue of the session on screen: what it shows, what it sends, what it refuses to
/// send, and when the deadline takes a card away.
library;

import 'package:fake_async/fake_async.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_event.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_lookup.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_outcome.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_queue.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/domain/repositories/approval_lock.dart';
import 'package:remote_claude/features/permission/domain/usecases/watch_permissions.dart';
import 'package:remote_claude/features/permission/presentation/providers/permission_queue_controller.dart';

import '../../../../../support/builders/permissions.dart';
import '../../../../../support/fakes/fake_permission_repository.dart';

void main() {
  late FakePermissionRepository repository;
  late FakeApprovalLock lock;
  late DateTime now;

  ProviderContainer build() {
    repository = FakePermissionRepository();
    lock = FakeApprovalLock();
    now = t0;

    final ProviderContainer container = ProviderContainer(
      overrides: permissionOverrides(repository: repository, lock: lock, clock: () => now),
    );
    addTearDown(container.dispose);

    // An `@riverpod` notifier goes as soon as nothing listens; holding it is what lets state
    // accumulate across events.
    container.listen(
      permissionQueueControllerProvider('session-1'),
      (PermissionQueue? previous, PermissionQueue next) {},
    );

    return container;
  }

  PermissionQueueController controller(ProviderContainer container) =>
      container.read(permissionQueueControllerProvider('session-1').notifier);

  PermissionQueue queue(ProviderContainer container) =>
      container.read(permissionQueueControllerProvider('session-1'));

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  Future<AnswerResult> answer(
    ProviderContainer container,
    PermissionDecision decision, {
    PermissionScope scope = PermissionScope.once,
    String requestId = 'request-1',
  }) => controller(container).answer(requestId, decision, scope, lockReason: 'confirm it is you');

  test('watches the session in the route, and lets it go with the screen', () async {
    final ProviderContainer container = build();

    expect(repository.feed.sessionId, 'session-1');

    container.dispose();
    expect(repository.feed.closed, isTrue);
  });

  test('a question from the server is a card', () async {
    final ProviderContainer container = build();

    repository.feed.emit(asked(aPermissionRequest()));
    await settle();

    expect(queue(container).cardOf('request-1'), isNotNull);
  });

  group('refusing', () {
    test(
      'goes straight out, with the reason the contract requires, and never asks the lock',
      () async {
        final ProviderContainer container = build();
        repository.feed.emit(asked(aPermissionRequest()));
        await settle();

        expect(await answer(container, PermissionDecision.deny), AnswerResult.sent);

        final SentAnswer sent = repository.feed.answers.single;
        expect(sent.decision, PermissionDecision.deny);
        expect(sent.frameId, 'frame-1');
        expect(sent.reason, refusedFromThePhone);
        expect(lock.asked, isEmpty);
      },
    );

    // The queue reacts to events, never to its own optimism: the card stays, sending, until the
    // server says how the request ended.
    test('keeps the card, sending, until the server settles it', () async {
      final ProviderContainer container = build();
      repository.feed.emit(asked(aPermissionRequest()));
      await settle();

      await answer(container, PermissionDecision.deny);
      expect(queue(container).cardOf('request-1')!.phase, CardPhase.sending);

      repository.feed.emit(settled('request-1', decision: PermissionDecision.deny));
      await settle();
      expect(queue(container).cardOf('request-1'), isNull);
    });
  });

  group('approving', () {
    test('something that is not destructive asks the lock once, then goes', () async {
      final ProviderContainer container = build();
      repository.feed.emit(asked(aPermissionRequest(riskHint: RiskHint.write)));
      await settle();

      expect(
        await answer(container, PermissionDecision.allow, scope: PermissionScope.session),
        AnswerResult.sent,
      );
      expect(lock.asked, <String>['confirm it is you']);
      expect(repository.feed.answers.single.scope, PermissionScope.session);
      expect(repository.feed.answers.single.reason, isNull);
    });

    // S-41 — one tap on a destructive yes arms it; nothing leaves until the second.
    test('something destructive takes a second step before anything leaves', () async {
      final ProviderContainer container = build();
      repository.feed.emit(asked(aPermissionRequest()));
      await settle();

      expect(await answer(container, PermissionDecision.allow), AnswerResult.confirming);
      expect(repository.feed.answers, isEmpty);
      expect(lock.asked, isEmpty);

      expect(await answer(container, PermissionDecision.allow), AnswerResult.sent);
      expect(repository.feed.answers, hasLength(1));
    });

    test('backing out of the second step leaves the card as it was', () async {
      final ProviderContainer container = build();
      repository.feed.emit(asked(aPermissionRequest()));
      await settle();

      await answer(container, PermissionDecision.allow);
      controller(container).disarm('request-1');

      expect(queue(container).cardOf('request-1')!.phase, CardPhase.idle);
    });

    // S-43 — the owner did not confirm: nothing is sent, and the card is given back.
    test('a lock that says no sends nothing', () async {
      final ProviderContainer container = build();
      lock.verdict = LockVerdict.refused;
      repository.feed.emit(asked(aPermissionRequest(riskHint: RiskHint.write)));
      await settle();

      expect(await answer(container, PermissionDecision.allow), AnswerResult.lockRefused);
      expect(repository.feed.answers, isEmpty);
      expect(queue(container).cardOf('request-1')!.phase, CardPhase.idle);
    });

    // S-83 — a phone with no lock does not approve, and can still refuse.
    test('a phone with no lock does not approve, and can still refuse', () async {
      final ProviderContainer container = build();
      lock.available = false;
      repository.feed.emit(asked(aPermissionRequest(riskHint: RiskHint.write)));
      await settle();

      expect(await answer(container, PermissionDecision.allow), AnswerResult.noLock);
      expect(await answer(container, PermissionDecision.deny), AnswerResult.sent);
      expect(repository.feed.answers.single.decision, PermissionDecision.deny);
    });

    test('a request answered elsewhere while the lock was up is not answered again', () async {
      final ProviderContainer container = build();
      repository.feed.emit(asked(aPermissionRequest(riskHint: RiskHint.write)));
      await settle();

      final Future<AnswerResult> pending = answer(container, PermissionDecision.allow);
      repository.feed.emit(settled('request-1'));

      expect(await pending, AnswerResult.ignored);
      expect(repository.feed.answers, isEmpty);
    });
  });

  // S-48 — a card that is answering takes no second tap.
  test('a second tap while the first answer is on its way sends nothing', () async {
    final ProviderContainer container = build();
    repository.feed.emit(asked(aPermissionRequest()));
    await settle();

    await answer(container, PermissionDecision.deny);

    expect(await answer(container, PermissionDecision.deny), AnswerResult.ignored);
    expect(repository.feed.answers, hasLength(1));
  });

  // S-87 — the socket was down: nothing left, and the card is answerable again.
  test('an answer that did not leave gives the card back', () async {
    final ProviderContainer container = build();
    repository.feed.emit(asked(aPermissionRequest()));
    await settle();
    repository.feed.connected = false;

    expect(await answer(container, PermissionDecision.deny), AnswerResult.notSent);
    expect(queue(container).cardOf('request-1')!.phase, CardPhase.idle);
  });

  test('a request that is not on screen is not answered', () async {
    final ProviderContainer container = build();

    expect(await answer(container, PermissionDecision.deny), AnswerResult.ignored);
  });

  group('asking for more time', () {
    test('sends the request and nothing else', () async {
      final ProviderContainer container = build();
      repository.feed.emit(asked(aPermissionRequest()));
      await settle();

      expect(controller(container).extend('request-1'), isTrue);
      expect(repository.feed.extensions, <String>['request-1']);
    });

    // S-65 — at the ceiling the action is gone: nothing is sent for a card that cannot be extended.
    test('at the ceiling sends nothing', () async {
      final ProviderContainer container = build();
      repository.feed
        ..emit(asked(aPermissionRequest()))
        ..emit(
          const PermissionExtensionRefused(
            requestId: 'request-1',
            refusal: ExtensionRefusal.ceiling,
          ),
        );
      await settle();

      expect(controller(container).extend('request-1'), isFalse);
      expect(repository.feed.extensions, isEmpty);
    });

    test('for a request that is not there sends nothing', () {
      final ProviderContainer container = build();

      expect(controller(container).extend('request-1'), isFalse);
    });
  });

  group('the revalidation', () {
    test('a pending answer puts the card on screen before the socket re-delivers it', () {
      final ProviderContainer container = build();

      controller(container).seed(LookupPending(aPermissionRequest(), remainingExtensions: 1));

      expect(queue(container).cardOf('request-1')!.remainingExtensions, 1);
    });

    test('any other answer puts nothing on screen', () {
      final ProviderContainer container = build();

      controller(container).seed(const LookupGone());

      expect(queue(container).pending, isEmpty);
    });
  });

  // S-81 — the countdown reaches zero and the card leaves as refused, with nobody asked.
  test('the deadline takes the card away as refused, on its own', () {
    fakeAsync((FakeAsync async) {
      final ProviderContainer container = build();
      repository.feed.emit(
        asked(aPermissionRequest(expiresAt: t0.add(const Duration(seconds: 3)))),
      );
      async.flushMicrotasks();

      now = t0.add(const Duration(seconds: 2));
      async.elapse(permissionTick * 2);
      expect(queue(container).cardOf('request-1'), isNotNull);
      expect(queue(container).asOf, now);

      now = t0.add(const Duration(seconds: 3));
      async.elapse(permissionTick);
      expect(queue(container).cardOf('request-1'), isNull);
      expect(queue(container).outcomeOf('request-1'), const PermissionOutcome.expired('request-1'));

      // Nothing left to count down: the tick stops rather than spinning for nothing.
      expect(async.periodicTimerCount, 0);
    });
  });
}

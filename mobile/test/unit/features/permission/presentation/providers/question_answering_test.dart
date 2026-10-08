/// Answering a question of Claude from the phone (plan 24, B-17): what leaves, what never asks the
/// lock, and the draft that a reconnect does not lose.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_event.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_outcome.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_queue.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/domain/entities/question.dart';
import 'package:remote_claude/features/permission/domain/usecases/watch_permissions.dart';
import 'package:remote_claude/features/permission/presentation/providers/permission_queue_controller.dart';

import '../../../../../support/builders/permissions.dart';
import '../../../../../support/builders/questions.dart';
import '../../../../../support/fakes/fake_permission_repository.dart';

void main() {
  late FakePermissionRepository repository;
  late FakeApprovalLock lock;

  ProviderContainer build() {
    repository = FakePermissionRepository();
    lock = FakeApprovalLock();

    final ProviderContainer container = ProviderContainer(
      overrides: permissionOverrides(repository: repository, lock: lock, clock: () => t0),
    );
    addTearDown(container.dispose);
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

  const List<QuestionAnswer> answers = <QuestionAnswer>[
    QuestionAnswer(questionId: 'q1', selected: <String>['Usage']),
    QuestionAnswer(questionId: 'q2', selected: <String>[], other: 'a wiki'),
    QuestionAnswer(questionId: 'q3', selected: <String>['Friendly']),
  ];

  test('S-83 · a yes leaves with the answers, once and with nothing to persist', () async {
    final ProviderContainer container = build();
    repository.feed.emit(asked(aQuestionRequest(), frameId: 'frame-q'));
    await settle();

    expect(controller(container).answerQuestion('request-q', answers), AnswerResult.sent);

    final SentAnswer sent = repository.feed.answers.single;
    expect(sent.decision, PermissionDecision.allow);
    expect(sent.scope, PermissionScope.once);
    expect(sent.frameId, 'frame-q');
    expect(sent.answers, answers);
    expect(queue(container).cardOf('request-q')!.phase, CardPhase.sending);
  });

  test('S-85 · answering asks neither the lock nor a second step', () async {
    final ProviderContainer container = build();
    lock.available = false;
    repository.feed.emit(asked(aQuestionRequest()));
    await settle();

    expect(controller(container).answerQuestion('request-q', answers), AnswerResult.sent);
    expect(lock.asked, isEmpty);
  });

  test('declining sends what was written, or our sentence for nothing', () async {
    final ProviderContainer container = build();
    repository.feed.emit(asked(aQuestionRequest()));
    repository.feed.emit(asked(aQuestionRequest(requestId: 'request-r'), frameId: 'frame-r'));
    await settle();

    controller(container).declineQuestion('request-q', '  ask me later ');
    controller(container).declineQuestion('request-r', '   ');

    expect(repository.feed.answers.map((SentAnswer each) => each.reason), <String?>[
      'ask me later',
      declinedFromThePhone,
    ]);
    expect(repository.feed.answers.every((SentAnswer each) => each.answers == null), isTrue);
  });

  test(
    'S-84 · the draft outlives a reset and the question republished, and goes when it is settled',
    () async {
      final ProviderContainer container = build();
      final QuestionDraft draft = const QuestionDraft().choose(sections, 'Usage');
      repository.feed.emit(asked(aQuestionRequest()));
      await settle();

      controller(container).saveDraft('request-q', draft);
      repository.feed.emit(const PermissionFeedReset());
      repository.feed.emit(asked(aQuestionRequest()));
      await settle();
      expect(queue(container).draftOf('request-q'), draft);

      repository.feed.emit(
        const PermissionSettled(
          PermissionOutcome(
            requestId: 'request-q',
            decision: PermissionDecision.allow,
            auto: false,
            origin: AnswerOrigin.web,
            answers: answers,
          ),
        ),
      );
      await settle();

      expect(queue(container).drafts, isEmpty);
      expect(queue(container).lastOutcome?.interaction, threeQuestions);
      expect(queue(container).lastOutcome?.answers, answers);
    },
  );

  test('a socket that is down sends nothing, and gives the card back with its draft', () async {
    final ProviderContainer container = build();
    repository.feed.emit(asked(aQuestionRequest()));
    await settle();
    final QuestionDraft draft = const QuestionDraft().choose(tone, 'Friendly');
    controller(container).saveDraft('request-q', draft);
    repository.feed.connected = false;

    expect(controller(container).answerQuestion('request-q', answers), AnswerResult.notSent);
    expect(queue(container).cardOf('request-q')!.phase, CardPhase.idle);
    expect(queue(container).draftOf('request-q'), draft);
  });

  test('a question already answering, or gone, takes no second answer', () async {
    final ProviderContainer container = build();
    repository.feed.emit(asked(aQuestionRequest()));
    await settle();

    controller(container).answerQuestion('request-q', answers);

    expect(controller(container).answerQuestion('request-q', answers), AnswerResult.ignored);
    expect(controller(container).declineQuestion('request-gone', ''), AnswerResult.ignored);
    expect(repository.feed.answers, hasLength(1));
  });

  test(
    'the deadline takes the question, its draft, and keeps its questions for the line',
    () async {
      DateTime now = t0;
      repository = FakePermissionRepository();
      final ProviderContainer container = ProviderContainer(
        overrides: permissionOverrides(repository: repository, clock: () => now),
      );
      addTearDown(container.dispose);
      container.listen(
        permissionQueueControllerProvider('session-1'),
        (PermissionQueue? previous, PermissionQueue next) {},
      );
      repository.feed.emit(asked(aQuestionRequest(expiresAt: t0.add(const Duration(seconds: 1)))));
      await settle();
      controller(container).saveDraft('request-q', const QuestionDraft().choose(tone, 'Friendly'));

      now = t0.add(const Duration(seconds: 2));
      controller(container).saveDraft('request-q', const QuestionDraft());

      expect(queue(container).pending, isEmpty);
      expect(queue(container).drafts, isEmpty);
      expect(queue(container).lastOutcome?.expired, isTrue);
      expect(queue(container).lastOutcome?.interaction, threeQuestions);
    },
  );
}

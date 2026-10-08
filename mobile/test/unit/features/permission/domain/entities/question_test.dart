import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/permission/domain/entities/question.dart';

import '../../../../../support/builders/questions.dart';

void main() {
  group('the draft of a question card — plan 24, B-17', () {
    test(
      'a single choice takes one label instead of the one before, and of the free answer — S-86',
      () {
        final QuestionDraft draft = const QuestionDraft()
            .toggleOther(format)
            .writeOther(format, 'mine')
            .choose(format, 'Classic prose')
            .choose(format, 'Plain list');

        expect(draft.chosenOf(format), <String>['Plain list']);
        expect(draft.otherOf(format), isNull);
      },
    );

    test('a multiple choice toggles beside the others and the free answer — S-87', () {
      final QuestionDraft draft = const QuestionDraft()
          .toggleOther(sections)
          .choose(sections, 'Usage')
          .choose(sections, 'License')
          .choose(sections, 'Usage');

      expect(draft.chosenOf(sections), <String>['License']);
      expect(draft.otherOf(sections), '');
    });

    test('"Other" on a single choice is the choice; marked and empty, it is no answer — S-88', () {
      final QuestionDraft marked = const QuestionDraft()
          .choose(format, 'Plain list')
          .toggleOther(format);

      expect(marked.chosenOf(format), isEmpty);
      expect(marked.isAnswered(format), isFalse);
      expect(marked.writeOther(format, '   ').isAnswered(format), isFalse);
      expect(marked.writeOther(format, 'a wiki').isAnswered(format), isTrue);
      expect(marked.toggleOther(format).otherOf(format), isNull);
    });

    test('every question needs an answer, and a malformed one never has one — S-91', () {
      final QuestionDraft two = const QuestionDraft()
          .choose(sections, 'Usage')
          .choose(format, 'Plain list');

      expect(two.allAnswered(threeQuestions), isFalse);
      expect(two.choose(tone, 'Friendly').allAnswered(threeQuestions), isTrue);
      expect(two.allAnswered(QuestionInteraction.unreadable), isFalse);
    });

    test('gives the answers in the order of the questions, the free answer trimmed or absent', () {
      final QuestionDraft draft = const QuestionDraft()
          .onStep(2)
          .choose(tone, 'Friendly')
          .choose(sections, 'License')
          .toggleOther(format)
          .writeOther(format, '  a wiki  ');

      expect(draft.step, 2);
      expect(draft.answersOf(threeQuestions), <QuestionAnswer>[
        const QuestionAnswer(questionId: 'q1', selected: <String>['License']),
        const QuestionAnswer(questionId: 'q2', selected: <String>[], other: 'a wiki'),
        const QuestionAnswer(questionId: 'q3', selected: <String>['Friendly']),
      ]);
    });

    test('tells the recommended option by the end of its label — D-23', () {
      expect(isRecommended('Professional (Recommended)'), isTrue);
      expect(isRecommended('Fast (recommended) '), isTrue);
      expect(isRecommended('Recommended reading'), isFalse);
    });
  });

  group('a question the history carries — plan 24, B-22', () {
    const Map<String, Object?> wire = <String, Object?>{
      'kind': 'question',
      'malformed': false,
      'questions': <Object?>[
        <String, Object?>{
          'id': 'q1',
          'header': 'Tone',
          'prompt': 'Which tone?',
          'multiSelect': false,
          'options': <Object?>[
            <String, Object?>{'label': 'Friendly', 'description': ''},
            <String, Object?>{'label': 'Formal', 'description': ''},
          ],
        },
      ],
    };

    test('reads the questions, how they ended, the answers and the reason', () {
      final RecordedQuestion? recorded = recordedQuestionFrom(<String, Object?>{
        'interaction': wire,
        'outcome': 'declined',
        'answers': <Object?>[
          <String, Object?>{
            'questionId': 'q1',
            'selected': <Object?>['Formal'],
          },
        ],
        'reason': 'Not now.',
      });

      expect(recorded?.interaction.questions.single.header, 'Tone');
      expect(recorded?.outcome, QuestionOutcome.declined);
      expect(recorded?.answers, const <QuestionAnswer>[
        QuestionAnswer(questionId: 'q1', selected: <String>['Formal']),
      ]);
      expect(recorded?.reason, 'Not now.');
    });

    test('reads each end there is, and none for one this build does not know', () {
      QuestionOutcome? endOf(Object? outcome) =>
          recordedQuestionFrom(<String, Object?>{'interaction': wire, 'outcome': outcome})?.outcome;

      expect(endOf('answered'), QuestionOutcome.answered);
      expect(endOf('expired'), QuestionOutcome.expired);
      expect(endOf('lost'), isNull);
      expect(endOf(null), isNull);
    });

    test('is nothing with no questions in it, or not an object at all', () {
      expect(recordedQuestionFrom(null), isNull);
      expect(recordedQuestionFrom('text'), isNull);
      expect(recordedQuestionFrom(<String, Object?>{'interaction': 'none'}), isNull);
    });
  });
}

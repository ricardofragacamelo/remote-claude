/// Questions of Claude, built for a test — the three of the recorded `question-turn` (plan 24, B-11):
/// a multiple choice, a single choice with previews, and a single choice with a recommended option.
library;

import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/domain/entities/question.dart';

import 'permissions.dart';

/// Which sections — a multiple choice.
const Question sections = Question(
  id: 'q1',
  header: 'Sections',
  prompt: 'Which sections should the README.md include?',
  multiSelect: true,
  options: <QuestionOption>[
    QuestionOption(label: 'Installation', description: 'How to install it.'),
    QuestionOption(label: 'Usage', description: 'How to run it.'),
    QuestionOption(label: 'License', description: 'Its terms.'),
  ],
);

/// Which format — a single choice, two of its options with a preview.
const Question format = Question(
  id: 'q2',
  header: 'Format',
  prompt: 'Which format should the README.md follow?',
  options: <QuestionOption>[
    QuestionOption(label: 'Classic prose', preview: '# Project Name\n\nA short paragraph.'),
    QuestionOption(label: 'Badge-heavy landing', preview: '<div align="center">\n# Badges\n</div>'),
    QuestionOption(label: 'Plain list', description: 'No preview for this one.'),
  ],
);

/// Which tone — a single choice whose first option is recommended.
const Question tone = Question(
  id: 'q3',
  header: 'Tone',
  prompt: 'What tone should the README.md be written in?',
  options: <QuestionOption>[
    QuestionOption(label: 'Professional (Recommended)'),
    QuestionOption(label: 'Friendly'),
  ],
);

/// The three of them.
const QuestionInteraction threeQuestions = QuestionInteraction(
  questions: <Question>[sections, format, tone],
);

/// A question of Claude the backend would send, with [interaction] as its questions.
PermissionRequest aQuestionRequest({
  String requestId = 'request-q',
  QuestionInteraction interaction = threeQuestions,
  DateTime? expiresAt,
}) => aPermissionRequest(
  requestId: requestId,
  toolUseId: 'toolu-q',
  toolName: 'AskUserQuestion',
  description: null,
  input: const <String, Object?>{'questions': <Object?>[]},
  riskHint: RiskHint.read,
  defaultToNo: false,
  expiresAt: expiresAt ?? t0.add(const Duration(minutes: 10)),
  scopes: const <PermissionScope>[],
  interaction: interaction,
);

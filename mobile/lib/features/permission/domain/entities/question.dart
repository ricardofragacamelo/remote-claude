/// Claude asking the person something — the questions of an `AskUserQuestion`, as the server
/// normalised them, what the person answered, and what they have chosen so far (plan 24).
///
/// Pure values: every rule of the card — what counts as an answer, what a choice does to the ones
/// before it — is a function here, proved without a widget.
library;

import 'package:equatable/equatable.dart';

/// One option of a question, its label exact: the answer is given with it.
class QuestionOption extends Equatable {
  const QuestionOption({required this.label, this.description = '', this.preview});

  final String label;
  final String description;

  /// A sample of what choosing it would make, in markdown — shown as monospaced text (D-21).
  final String? preview;

  @override
  List<Object?> get props => <Object?>[label, description, preview];
}

/// One question.
class Question extends Equatable {
  const Question({
    required this.id,
    required this.prompt,
    required this.options,
    this.header = '',
    this.multiSelect = false,
  });

  /// `q1`…`q4` — what an answer names.
  final String id;
  final String header;
  final String prompt;
  final bool multiSelect;
  final List<QuestionOption> options;

  @override
  List<Object?> get props => <Object?>[id, header, prompt, multiSelect, options];
}

/// The questions of a request. [malformed] is a question nobody can read safely — on the server's
/// word, or this build's: it can only be refused (D-16).
class QuestionInteraction extends Equatable {
  const QuestionInteraction({required this.questions, this.malformed = false});

  /// A question that cannot be read, and so cannot be answered.
  static const QuestionInteraction unreadable = QuestionInteraction(
    questions: <Question>[],
    malformed: true,
  );

  final bool malformed;
  final List<Question> questions;

  @override
  List<Object?> get props => <Object?>[malformed, questions];
}

/// What a person answered to one question: the labels and the free answer, apart (D-03).
class QuestionAnswer extends Equatable {
  const QuestionAnswer({required this.questionId, required this.selected, this.other});

  final String questionId;
  final List<String> selected;

  /// The free answer ("Other"), or `null` when there is none.
  final String? other;

  @override
  List<Object?> get props => <Object?>[questionId, selected, other];
}

/// What a person has chosen so far on the card of a question — kept by request, outside the card,
/// so a reconnect never loses it (plan 24, R-06).
class QuestionDraft extends Equatable {
  const QuestionDraft({
    this.step = 0,
    this.selected = const <String, List<String>>{},
    this.other = const <String, String?>{},
  });

  /// The question on screen.
  final int step;
  final Map<String, List<String>> selected;

  /// The free answer of each question: its text when "Other" is marked — empty while nothing is
  /// typed —, `null` or absent when it is not.
  final Map<String, String?> other;

  /// The labels chosen on [question].
  List<String> chosenOf(Question question) => selected[question.id] ?? const <String>[];

  /// The free answer of [question], or `null` when "Other" is not marked.
  String? otherOf(Question question) => other[question.id];

  /// After [label] is chosen: a single choice takes it **instead** of everything — the free answer
  /// included —, a multiple one toggles it beside the others.
  QuestionDraft choose(Question question, String label) {
    final List<String> current = chosenOf(question);

    if (question.multiSelect) {
      return _copy(
        selected: <String, List<String>>{
          ...selected,
          question.id: current.contains(label)
              ? current.where((String chosen) => chosen != label).toList(growable: false)
              : <String>[...current, label],
        },
      );
    }

    return _copy(
      selected: <String, List<String>>{
        ...selected,
        question.id: <String>[label],
      },
      other: <String, String?>{...other, question.id: null},
    );
  }

  /// After "Other" is marked or unmarked. Marked, it starts empty — and on a single choice it is the
  /// choice, so the labels go.
  QuestionDraft toggleOther(Question question) {
    if (otherOf(question) != null) {
      return _copy(other: <String, String?>{...other, question.id: null});
    }

    return _copy(
      other: <String, String?>{...other, question.id: ''},
      selected: question.multiSelect
          ? selected
          : <String, List<String>>{...selected, question.id: const <String>[]},
    );
  }

  /// With [text] typed as the free answer of [question].
  QuestionDraft writeOther(Question question, String text) =>
      _copy(other: <String, String?>{...other, question.id: text});

  /// On another question.
  QuestionDraft onStep(int next) => _copy(step: next);

  /// The free answer worth sending: marked, and not blank.
  String? _filledOther(Question question) {
    final String text = otherOf(question)?.trim() ?? '';
    return text.isEmpty ? null : text;
  }

  /// Whether [question] has an answer: a label, or a free answer with something in it — "Other"
  /// marked and left empty is no answer (S-88).
  bool isAnswered(Question question) =>
      chosenOf(question).isNotEmpty || _filledOther(question) != null;

  /// Whether every question has one — what "Send answers" waits for (D-04).
  bool allAnswered(QuestionInteraction interaction) =>
      !interaction.malformed && interaction.questions.every(isAnswered);

  /// The answers to send, in the order of the questions, the free answer trimmed.
  List<QuestionAnswer> answersOf(QuestionInteraction interaction) => <QuestionAnswer>[
    for (final Question question in interaction.questions)
      QuestionAnswer(
        questionId: question.id,
        selected: List<String>.unmodifiable(chosenOf(question)),
        other: _filledOther(question),
      ),
  ];

  QuestionDraft _copy({
    int? step,
    Map<String, List<String>>? selected,
    Map<String, String?>? other,
  }) => QuestionDraft(
    step: step ?? this.step,
    selected: selected ?? this.selected,
    other: other ?? this.other,
  );

  @override
  List<Object?> get props => <Object?>[step, selected, other];
}

/// The option Claude recommends — its label ends in "(Recommended)". Highlighted, never pre-chosen
/// (D-23).
bool isRecommended(String label) =>
    RegExp(r'\(recommended\)\s*$', caseSensitive: false).hasMatch(label);

/// The questions of a request, or `null` when it is not a question (plan 24, B-17).
///
/// It **fails closed**: a question this build cannot read whole — a field missing, fewer than two
/// options — is read as one that can only be refused. Half a question on screen is an invitation to
/// answer something Claude did not ask.
QuestionInteraction? questionInteractionFrom(Object? value) {
  if (value is! Map<String, Object?> || value['kind'] != 'question') {
    return null;
  }

  final Object? sent = value['questions'];
  final List<Object?> entries = sent is List<Object?> ? sent : const <Object?>[];
  final List<Question> questions = <Question>[
    for (final Object? entry in entries) ?_question(entry),
  ];

  return value['malformed'] == true || entries.isEmpty || questions.length != entries.length
      ? QuestionInteraction.unreadable
      : QuestionInteraction(questions: questions);
}

Question? _question(Object? entry) {
  if (entry is! Map<String, Object?>) {
    return null;
  }

  final String id = _text(entry, 'id') ?? '';
  final String prompt = _text(entry, 'prompt') ?? '';
  final Object? sent = entry['options'];
  final List<Object?> entries = sent is List<Object?> ? sent : const <Object?>[];
  final List<QuestionOption> options = <QuestionOption>[
    for (final Object? option in entries) ?_option(option),
  ];

  if (id.isEmpty || prompt.isEmpty || options.length < 2 || options.length != entries.length) {
    return null;
  }

  return Question(
    id: id,
    prompt: prompt,
    options: options,
    header: _text(entry, 'header') ?? '',
    multiSelect: entry['multiSelect'] == true,
  );
}

QuestionOption? _option(Object? entry) {
  if (entry is! Map<String, Object?>) {
    return null;
  }

  final String label = _text(entry, 'label') ?? '';
  final String? preview = _text(entry, 'preview');

  return label.isEmpty
      ? null
      : QuestionOption(
          label: label,
          description: _text(entry, 'description') ?? '',
          preview: preview == null || preview.isEmpty ? null : preview,
        );
}

/// The answers a settlement carries, or `null` when it carries none.
List<QuestionAnswer>? questionAnswersFrom(Object? value) => value is List<Object?>
    ? <QuestionAnswer>[for (final Object? entry in value) ?_answer(entry)]
    : null;

QuestionAnswer? _answer(Object? entry) {
  if (entry is! Map<String, Object?>) {
    return null;
  }

  final String? questionId = _text(entry, 'questionId');
  final Object? selected = entry['selected'];

  return questionId == null || selected is! List<Object?>
      ? null
      : QuestionAnswer(
          questionId: questionId,
          selected: selected.whereType<String>().toList(growable: false),
          other: _text(entry, 'other'),
        );
}

/// How a question of Claude ended, as the history says it (plan 24, B-21).
enum QuestionOutcome { answered, declined, expired }

/// A question of Claude as `tool.completed` carries it: the questions and, when this backend
/// recorded them, how they ended (plan 24, B-22).
class RecordedQuestion extends Equatable {
  const RecordedQuestion({required this.interaction, this.outcome, this.answers, this.reason});

  final QuestionInteraction interaction;

  /// How it ended — `null` with no record of it here: answered in another client, say.
  final QuestionOutcome? outcome;
  final List<QuestionAnswer>? answers;

  /// Why it was refused, on `declined`.
  final String? reason;

  @override
  List<Object?> get props => <Object?>[interaction, outcome, answers, reason];
}

/// The question a `tool.completed` carries, or `null` when it carries none — any other tool, or an
/// older server. Its questions fail closed, as the card's do.
RecordedQuestion? recordedQuestionFrom(Object? value) {
  if (value is! Map<String, Object?>) {
    return null;
  }

  final QuestionInteraction? interaction = questionInteractionFrom(value['interaction']);

  return interaction == null
      ? null
      : RecordedQuestion(
          interaction: interaction,
          outcome: switch (value['outcome']) {
            'answered' => QuestionOutcome.answered,
            'declined' => QuestionOutcome.declined,
            'expired' => QuestionOutcome.expired,
            _ => null,
          },
          answers: questionAnswersFrom(value['answers']),
          reason: _text(value, 'reason'),
        );
}

/// The string at [key], or `null` when it is absent or not a string.
String? _text(Map<String, Object?> payload, String key) {
  final Object? value = payload[key];
  return value is String ? value : null;
}

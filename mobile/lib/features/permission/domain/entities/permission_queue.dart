/// The questions of one session, and how the last ones ended.
///
/// The most delicate state in the app, held together by four rules — each one closes a way of being
/// wrong that a person would notice:
///
/// - **the queue reacts to events, never to its own optimism.** A request answered on the web
///   leaves this queue because `permission.resolved` said so, not because this phone did anything;
/// - **losing the race is not an error.** The card leaves showing who won;
/// - **a card that is answering takes no second tap** (S-48). Two taps are two answers;
/// - **an expired card leaves as refused, silently** (S-81). Silence never authorises.
///
/// Pure values: every transition is a function of (queue, something that happened), which is what
/// lets the rules be proved without a socket, a clock or a widget.
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_event.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_outcome.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';

/// Where one card is in the round trip of an answer.
enum CardPhase {
  /// Waiting for the person.
  idle,

  /// A yes that needs it was tapped once and waits for the deliberate second step — a destructive
  /// one (S-41), or one that persists a rule (S-65).
  confirming,

  /// An answer of this phone is on its way. Nothing else is accepted until the server says how the
  /// request ended — or until the answer turns out never to have left (S-87).
  sending,
}

/// One question on screen.
class PermissionCard extends Equatable {
  const PermissionCard({
    required this.request,
    this.frameId,
    this.phase = CardPhase.idle,
    this.remainingExtensions,
    this.extensionRefused = false,
  });

  final PermissionRequest request;

  /// The `id` of the `request` frame, which an answer has to name.
  ///
  /// `null` while the card is known only from the server's revalidation and the socket has not
  /// re-delivered the question yet. An answer needs both: the backend only accepts one from a
  /// connection attached to the session, and the attach is what re-delivers the frame.
  final String? frameId;

  final CardPhase phase;

  /// How many extensions are left, once somebody has said. `null` is "not known yet" — the question
  /// itself does not carry it — and an unknown number is not a reason to hide the action.
  final int? remainingExtensions;

  /// The server refused to extend it again. The action goes, and the screen says why.
  final bool extensionRefused;

  String get requestId => request.requestId;

  /// Whether an answer can leave from this card right now.
  bool get isAnswerable => frameId != null && phase != CardPhase.sending;

  /// Whether asking for more time is still something the backend would grant.
  bool get isExtendable => !extensionRefused && remainingExtensions != 0;

  PermissionCard _copy({
    PermissionRequest? request,
    String? frameId,
    CardPhase? phase,
    int? remainingExtensions,
    bool? extensionRefused,
  }) => PermissionCard(
    request: request ?? this.request,
    frameId: frameId ?? this.frameId,
    phase: phase ?? this.phase,
    remainingExtensions: remainingExtensions ?? this.remainingExtensions,
    extensionRefused: extensionRefused ?? this.extensionRefused,
  );

  @override
  List<Object?> get props => <Object?>[
    request,
    frameId,
    phase,
    remainingExtensions,
    extensionRefused,
  ];
}

/// What tapping a decision on a card leads to, before anything is sent.
enum AnswerStep {
  /// Nothing: the card is not there, is already answering, or cannot answer yet.
  ignored,

  /// The yes needs its second step first: destructive (S-41), or persisted (S-65).
  confirm,

  /// The answer may go.
  send,
}

/// The queue of one session.
class PermissionQueue extends Equatable {
  const PermissionQueue({
    this.pending = const <PermissionCard>[],
    this.settled = const <PermissionOutcome>[],
    this.asOf,
  });

  /// The open questions, oldest first.
  final List<PermissionCard> pending;

  /// How the requests that left ended, newest last.
  final List<PermissionOutcome> settled;

  /// The instant the countdowns are computed against — the last tick. `null` before the first.
  final DateTime? asOf;

  /// The card of [requestId], when it is still open.
  PermissionCard? cardOf(String requestId) {
    for (final PermissionCard card in pending) {
      if (card.requestId == requestId) {
        return card;
      }
    }
    return null;
  }

  /// How [requestId] ended, when it has.
  PermissionOutcome? outcomeOf(String requestId) {
    for (final PermissionOutcome outcome in settled.reversed) {
      if (outcome.requestId == requestId) {
        return outcome;
      }
    }
    return null;
  }

  /// The last request that left, for the line the screen shows afterwards.
  PermissionOutcome? get lastOutcome => settled.isEmpty ? null : settled.last;

  /// This queue with [event] applied.
  PermissionQueue apply(PermissionEvent event) => switch (event) {
    PermissionAsked() => _asked(event),
    PermissionSettled(:final PermissionOutcome outcome) => _settle(outcome),
    PermissionDeadlineMoved() => _change(
      event.requestId,
      (PermissionCard card) => card._copy(
        request: card.request.withDeadline(event.expiresAt),
        remainingExtensions: event.remainingExtensions,
      ),
    ),
    PermissionExtensionRefused(refusal: ExtensionRefusal.ceiling) => _change(
      event.requestId,
      (PermissionCard card) => card._copy(remainingExtensions: 0, extensionRefused: true),
    ),
    // Already over: the settlement is on its way on its own, and it is what removes the card. A
    // refusal must not be the thing that revives or rewrites it (S-66).
    PermissionExtensionRefused(refusal: ExtensionRefusal.over) => this,
    PermissionFeedReset() => PermissionQueue(asOf: asOf),
  };

  /// Seeds a card from the server's revalidation, before the socket has re-delivered it.
  ///
  /// It never replaces what the stream already said: a card that is on screen is fresher, and a
  /// request that already ended must not come back because a slower answer arrived afterwards.
  PermissionQueue seed(PermissionRequest request, {int? remainingExtensions}) {
    if (cardOf(request.requestId) != null || outcomeOf(request.requestId) != null) {
      return this;
    }

    return _with(
      pending: <PermissionCard>[
        ...pending,
        PermissionCard(request: request, remainingExtensions: remainingExtensions),
      ],
    );
  }

  /// What tapping [decision] with [scope] on [requestId] leads to.
  ///
  /// Refusing is never behind a second step: it is the safe answer, and a barrier in front of it
  /// only delays the "no".
  AnswerStep stepFor(String requestId, PermissionDecision decision, PermissionScope scope) {
    final PermissionCard? card = cardOf(requestId);

    if (card == null || !card.isAnswerable) {
      return AnswerStep.ignored;
    }

    final bool needsSecondStep =
        decision == PermissionDecision.allow &&
        card.request.needsConfirmation(scope) &&
        card.phase != CardPhase.confirming;

    return needsSecondStep ? AnswerStep.confirm : AnswerStep.send;
  }

  /// The first step of a yes that needs two.
  PermissionQueue arm(String requestId) => _phase(requestId, CardPhase.confirming);

  /// Backs out of the second step.
  PermissionQueue disarm(String requestId) => _phase(requestId, CardPhase.idle);

  /// An answer of this phone is leaving.
  PermissionQueue markSending(String requestId) => _phase(requestId, CardPhase.sending);

  /// The answer never left — the socket was down, or the lock said no. The card is given back
  /// rather than left looking busy on a question nobody is answering (S-87).
  PermissionQueue release(String requestId) => _phase(requestId, CardPhase.idle);

  /// Moves the countdowns to [now], and lets go of what the deadline has refused (S-81).
  ///
  /// Without a confirmation: the server has already refused it, and asking about something that is
  /// over is asking about nothing.
  PermissionQueue tick(DateTime now) {
    final List<PermissionCard> open = <PermissionCard>[];
    final List<PermissionOutcome> ended = <PermissionOutcome>[];

    for (final PermissionCard card in pending) {
      if (card.request.isExpiredAt(now)) {
        ended.add(PermissionOutcome.expired(card.requestId));
      } else {
        open.add(card);
      }
    }

    return PermissionQueue(
      pending: open,
      settled: <PermissionOutcome>[...settled, ...ended],
      asOf: now,
    );
  }

  PermissionQueue _asked(PermissionAsked event) {
    final String requestId = event.request.requestId;

    // A question that already ended is not asked again. The replay republishes what is still
    // open, and a frame that raced a settlement must not bring its card back.
    if (outcomeOf(requestId) != null) {
      return this;
    }

    final PermissionCard? known = cardOf(requestId);

    if (known == null) {
      return _with(
        pending: <PermissionCard>[
          ...pending,
          PermissionCard(request: event.request, frameId: event.frameId),
        ],
      );
    }

    // Asked again after a reconnect: the same question, so it keeps its place, its phase and what
    // is known about its extensions. Only the frame to answer and the deadline are new.
    return _change(
      requestId,
      (PermissionCard card) => card._copy(request: event.request, frameId: event.frameId),
    );
  }

  PermissionQueue _settle(PermissionOutcome outcome) => _with(
    pending: pending
        .where((PermissionCard card) => card.requestId != outcome.requestId)
        .toList(growable: false),
    settled: <PermissionOutcome>[
      ...settled.where((PermissionOutcome known) => known.requestId != outcome.requestId),
      outcome,
    ],
  );

  PermissionQueue _phase(String requestId, CardPhase phase) =>
      _change(requestId, (PermissionCard card) => card._copy(phase: phase));

  PermissionQueue _change(String requestId, PermissionCard Function(PermissionCard card) change) {
    if (cardOf(requestId) == null) {
      return this;
    }

    return _with(
      pending: pending
          .map((PermissionCard card) => card.requestId == requestId ? change(card) : card)
          .toList(growable: false),
    );
  }

  PermissionQueue _with({List<PermissionCard>? pending, List<PermissionOutcome>? settled}) =>
      PermissionQueue(
        pending: pending ?? this.pending,
        settled: settled ?? this.settled,
        asOf: asOf,
      );

  @override
  List<Object?> get props => <Object?>[pending, settled, asOf];
}

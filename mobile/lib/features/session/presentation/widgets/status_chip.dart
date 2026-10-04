/// How the session stands, in the bar (plan 10, B-15): a chip whose colour is said in words too —
/// never colour alone — that opens the details a phone has no tooltip for: the standing in full, the
/// id of the session with the way to copy it, and what it has cost since it opened (D-08).
///
/// How the **turn** goes is not the bar's: that is the tail of the conversation (B-18).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/connection_line.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/core/widgets/message_strip.dart';
import 'package:remote_claude/core/widgets/note_line.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/presentation/providers/live_session_controller.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_menu.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_sheet.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// How a session stands, at a glance.
enum SessionStanding { connected, reconnecting, running, waiting, ended }

/// The standing of a session: ended first, then the socket, then a question, then the turn.
SessionStanding standingOf(
  Conversation conversation,
  ConnectionStatus connection, {
  int waiting = 0,
}) {
  if (conversation.status == SessionStatus.closed || conversation.ending != null) {
    return SessionStanding.ended;
  }

  if (connection != ConnectionStatus.ready) {
    return SessionStanding.reconnecting;
  }

  if (conversation.status == SessionStatus.waitingPermission || waiting > 0) {
    return SessionStanding.waiting;
  }

  return conversation.isTurnRunning ? SessionStanding.running : SessionStanding.connected;
}

/// How [sessionId] stands now, watched: its conversation, the socket and the [waiting] questions —
/// the one reading the chip's sheet and the folder's panel both show (plan 10, F9).
SessionStanding watchStanding(WidgetRef ref, String sessionId, {required int waiting}) =>
    standingOf(
      ref.watch(liveSessionControllerProvider(sessionId)).conversation,
      connectionOf(ref.watch(connectionStatusProvider)),
      waiting: waiting,
    );

/// The word of the chip.
String standingWord(AppLocalizations l10n, SessionStanding standing) => switch (standing) {
  SessionStanding.connected => l10n.sessionStandingConnected,
  SessionStanding.reconnecting => l10n.sessionStandingReconnecting,
  SessionStanding.running => l10n.sessionStandingRunning,
  SessionStanding.waiting => l10n.sessionStandingWaiting,
  SessionStanding.ended => l10n.sessionStandingEnded,
};

/// The sentence of the sheet.
String standingSentence(AppLocalizations l10n, SessionStanding standing) => switch (standing) {
  SessionStanding.connected => l10n.sessionDotConnected,
  SessionStanding.reconnecting => l10n.sessionDotReconnecting,
  SessionStanding.running => l10n.sessionDotRunning,
  SessionStanding.waiting => l10n.sessionDotWaiting,
  SessionStanding.ended => l10n.sessionDotEnded,
};

/// The colour of each standing — a role of the scheme, never a shade, and never alone.
Color standingColour(ColorScheme scheme, SessionStanding standing) => switch (standing) {
  SessionStanding.connected => scheme.primary,
  SessionStanding.reconnecting => scheme.outline,
  SessionStanding.running => scheme.tertiary,
  SessionStanding.waiting => scheme.error,
  SessionStanding.ended => scheme.onSurfaceVariant,
};

/// What a session cost, as a person reads money: four decimals at most, as the web says it.
String formatUsd(String costUsd, String locale) {
  final NumberFormat format = NumberFormat.simpleCurrency(locale: locale, name: 'USD')
    ..minimumFractionDigits = 2
    ..maximumFractionDigits = 4;

  return format.format(double.tryParse(costUsd) ?? 0);
}

/// The chip of [sessionId], as it stands.
class StatusChip extends ConsumerWidget {
  const StatusChip({required this.sessionId, required this.waiting, super.key});

  final String sessionId;

  /// How many questions wait on the person.
  final int waiting;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final SessionStanding standing = watchStanding(ref, sessionId, waiting: waiting);
    final String word = standingWord(l10n, standing);

    // A node of its own: inside the title of the bar it would merge into the heading, and the title
    // would read as a button.
    return Semantics(
      container: true,
      button: true,
      liveRegion: true,
      label: l10n.sessionStandingOpen(word),
      excludeSemantics: true,
      child: ActionChip(
        avatar: _Dot(standing: standing),
        label: Text(word, maxLines: 1, overflow: TextOverflow.ellipsis),
        onPressed: () => unawaited(
          showSheet(
            context,
            (BuildContext _) => StatusSheet(sessionId: sessionId, waiting: waiting),
          ),
        ),
      ),
    );
  }
}

/// The dot of a standing.
class _Dot extends StatelessWidget {
  const _Dot({required this.standing});

  final SessionStanding standing;

  @override
  Widget build(BuildContext context) => Container(
    width: Tokens.spaceSm + 2,
    height: Tokens.spaceSm + 2,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: standingColour(Theme.of(context).colorScheme, standing),
    ),
  );
}

/// The details of the session: how it stands, which it is, and what it cost (D-08).
class StatusSheet extends ConsumerWidget {
  const StatusSheet({required this.sessionId, required this.waiting, super.key});

  final String sessionId;
  final int waiting;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final Conversation conversation = ref
        .watch(liveSessionControllerProvider(sessionId))
        .conversation;
    final SessionStanding standing = watchStanding(ref, sessionId, waiting: waiting);
    final int turns = conversation.turns.length;

    return SingleChildScrollView(
      child: ContentColumn(
        children: <Widget>[
          SheetHeading(l10n.sessionStatusTitle, large: true),
          NoteLine(l10n.sessionStatusDescription),
          const SizedBox(height: Tokens.spaceSm),
          Row(
            children: <Widget>[
              _Dot(standing: standing),
              const SizedBox(width: Tokens.spaceSm),
              Expanded(child: Text(standingSentence(l10n, standing))),
            ],
          ),
          Row(
            children: <Widget>[
              Expanded(
                child: SelectableText(
                  l10n.sessionDotSession(sessionId),
                  style: identifierStyle(context),
                ),
              ),
              IconButton(
                tooltip: l10n.sessionMenuCopyId,
                icon: const Icon(Icons.copy),
                onPressed: () => unawaited(copySessionId(context, sessionId)),
              ),
            ],
          ),
          // Before the first turn ended there is no cost — never "$0", which would be a number about
          // nothing (S-47).
          Text(
            turns == 0
                ? l10n.sessionStatusNoCost
                : l10n.sessionStatusCost(
                    formatUsd(
                      conversation.costUsd,
                      Localizations.localeOf(context).toLanguageTag(),
                    ),
                    '$turns',
                  ),
          ),
        ],
      ),
    );
  }
}

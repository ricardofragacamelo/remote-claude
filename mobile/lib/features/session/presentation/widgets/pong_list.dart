/// The round trips that came back.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/features/session/domain/entities/pong.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// Renders the received pongs, newest last.
class PongList extends StatelessWidget {
  const PongList({required this.pongs, super.key});

  /// What came back, in arrival order.
  final List<Pong> pongs;

  @override
  Widget build(BuildContext context) => ListView.builder(
    shrinkWrap: true,
    physics: const NeverScrollableScrollPhysics(),
    itemCount: pongs.length,
    itemBuilder: (BuildContext context, int index) => _PongCard(pong: pongs[index]),
  );
}

/// One round trip.
class _PongCard extends StatelessWidget {
  const _PongCard({required this.pong});

  final Pong pong;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: Tokens.spaceSm),
      child: Card(
        child: ContentColumn(
          children: <Widget>[
            Text(l10n.sessionPingResult(pong.pingCount, pong.pingedAt)),
            Text(l10n.sessionPingSequence(pong.seq), style: identifierStyle(context)),
          ],
        ),
      ),
    );
  }
}

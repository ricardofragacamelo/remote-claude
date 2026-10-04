/// "Claude is waiting for your answer (n)", over the box, whenever a question's card is out of view
/// (plan 10, B-22, R-03) — and the way to it. Tapping it scrolls to the oldest question and puts the
/// focus there.
///
/// It is how a question that arrives while somebody writes is said without taking the box from them
/// (09 · D-13): the live region announces it, and nothing here answers anything (S-73).
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// Where the cards of the questions are on screen, and the way to them.
///
/// The conversation is the only one that knows where things are drawn — it owns the one scroll —
/// so it measures and reports here; the pill and the working indicator read from here and ask here.
class QuestionsInView extends ChangeNotifier {
  /// The focus of each card drawn — what the pill puts the focus on, and what tells where the card is.
  final Map<String, FocusNode> _nodes = <String, FocusNode>{};

  bool _outOfView = false;

  /// Takes the conversation to a card, once the conversation said how.
  void Function(String requestId)? _goTo;

  /// Whether the card of any open question is out of view.
  bool get outOfView => _outOfView;

  /// The focus the card of [requestId] is drawn with.
  FocusNode nodeFor(String requestId) =>
      _nodes.putIfAbsent(requestId, () => FocusNode(debugLabel: requestId));

  /// The card of [requestId], when it is drawn now.
  BuildContext? cardOf(String requestId) => _nodes[requestId]?.context;

  /// Forgets the cards of questions that are no longer open.
  void keepOnly(Iterable<String> requestIds) {
    final Set<String> open = requestIds.toSet();

    for (final String gone in _nodes.keys.where((String id) => !open.contains(id)).toList()) {
      _nodes.remove(gone)?.dispose();
    }
  }

  @override
  void dispose() {
    for (final FocusNode node in _nodes.values) {
      node.dispose();
    }
    _nodes.clear();
    super.dispose();
  }

  /// What the conversation measured.
  void report({required bool outOfView}) {
    if (outOfView != _outOfView) {
      _outOfView = outOfView;
      notifyListeners();
    }
  }

  /// How the conversation goes to a card — set while it is on screen, `null` once it is gone.
  set navigator(void Function(String requestId)? goTo) => _goTo = goTo;

  /// Takes the person to the card of [requestId].
  void goTo(String requestId) => _goTo?.call(requestId);

  /// Puts the focus on the card of [requestId], once it is drawn.
  void focus(String requestId) => _nodes[requestId]?.requestFocus();
}

/// The pill, and the announcement under it.
class PendingPill extends StatelessWidget {
  const PendingPill({
    required this.count,
    required this.outOfView,
    required this.onGoTo,
    super.key,
  });

  /// How many questions wait.
  final int count;

  /// The card of one of them is out of view.
  final bool outOfView;

  /// Takes the person to the oldest.
  final VoidCallback onGoTo;

  @override
  Widget build(BuildContext context) {
    final String label = AppLocalizations.of(context).sessionPendingPill('$count');
    final ColorScheme scheme = Theme.of(context).colorScheme;

    // Announced whenever a question is open — in view or not — so a question that arrives while the
    // box has the focus is heard without the focus moving (S-72).
    if (count == 0 || !outOfView) {
      return Semantics(liveRegion: true, label: count == 0 ? '' : label, child: const SizedBox());
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Tokens.spaceSm / 2),
      child: Center(
        child: Semantics(
          liveRegion: true,
          child: ActionChip(
            avatar: Icon(Icons.contact_support_outlined, color: scheme.primary),
            label: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
            side: BorderSide(color: scheme.primary),
            onPressed: onGoTo,
          ),
        ),
      ),
    );
  }
}

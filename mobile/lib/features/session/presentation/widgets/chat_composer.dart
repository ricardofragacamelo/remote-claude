/// Where a turn is written: the box, and the bar under it — `/` · mode · model · effort · context ·
/// send or stop (plan 10, B-10). One composer for the draft and the session, so the two cannot drift.
///
/// It clears **only when the command left**. A composer that empties on a socket that was not
/// ready is the worst of the three outcomes: the person watches their prompt disappear, believes
/// it was sent, and waits for an answer that was never asked for (S-76 of plan 01). A draft or a
/// resume keeps the text until its session answers — and keeps it when the answer is a refusal.
///
/// The commands sheet only **fills** the box: what is sent is whatever the box holds, typed or
/// picked. The menu is discovery, not a boundary (D-05 of plan 04).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/features/session/presentation/widgets/composer_bar.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

export 'package:remote_claude/features/session/presentation/widgets/composer_bar.dart'
    show ComposerChoice;

/// What became of a send.
enum SendOutcome {
  /// The command left: the box clears.
  sent,

  /// Something is on its way that the text depends on — a session opening, a resume. The box keeps
  /// the text, and the screen says what it waits for.
  pending,

  /// Nothing left: the socket was not ready. The box keeps the text and says so.
  notSent,
}

/// The highest share of the height left the box takes before it scrolls inside (09 · D-04).
const double boxShare = 0.4;

/// A screen that owns the text of a box: made with it, and disposing of it when it goes.
///
/// The draft and the session both do: the text lives in the screen's state, which a rotation
/// keeps (S-25), and not in the composer, which the screen rebuilds.
mixin BoxOwner<T extends StatefulWidget> on State<T> {
  /// The text of the box.
  late final TextEditingController box = TextEditingController(text: initialText());

  /// What the box starts with — nothing, unless the screen says otherwise.
  String? initialText() => null;

  @override
  void dispose() {
    box.dispose();
    super.dispose();
  }
}

/// What the composer is doing, as the screen around it decides.
class ComposerState {
  const ComposerState({
    this.isEnabled = true,
    this.isBusy = false,
    this.busyLabel,
    this.isTurnRunning = false,
    this.isClosed = false,
    this.isStopping = false,
  });

  /// Whether anything may be sent at all — false with the socket gone.
  final bool isEnabled;

  /// A send is waiting on its session: nothing more is sent until it answers.
  final bool isBusy;

  /// What the send button says while busy.
  final String? busyLabel;

  /// A turn runs: send queues, and stop is offered.
  final bool isTurnRunning;

  /// The session ended: no stop, and send resumes it (09 · D-05).
  final bool isClosed;

  /// An interrupt left: stop does not send another.
  final bool isStopping;
}

/// The box and its bar.
class ChatComposer extends StatefulWidget {
  const ChatComposer({
    required this.controller,
    required this.onSend,
    required this.mode,
    super.key,
    this.state = const ComposerState(),
    this.choices = const <ComposerChoice>[],
    this.onStop,
    this.onOpenCommands,
  });

  /// The text of the box. Owned by the screen, which survives a rotation with it (S-25).
  final TextEditingController controller;

  /// Sends one turn, and says what became of it.
  final SendOutcome Function(String text) onSend;

  final ComposerState state;

  /// The mode, which never leaves the bar.
  final ComposerChoice mode;

  /// The model, the effort and the context — what goes to the overflow when the bar is narrow.
  final List<ComposerChoice> choices;

  /// Stops the turn that is running.
  final VoidCallback? onStop;

  /// Opens the commands sheet filtered by a query, and answers what to put in the box.
  final Future<String?> Function(String query)? onOpenCommands;

  @override
  State<ChatComposer> createState() => _ChatComposerState();
}

class _ChatComposerState extends State<ChatComposer> {
  bool _notSent = false;
  String _before = '';

  /// What the menu answered is being put in the box — a `/` that is not typed.
  bool _picking = false;

  @override
  void initState() {
    super.initState();
    _before = widget.controller.text;
    widget.controller.addListener(_changed);
  }

  @override
  void didUpdateWidget(ChatComposer old) {
    super.didUpdateWidget(old);

    if (old.controller != widget.controller) {
      old.controller.removeListener(_changed);
      widget.controller.addListener(_changed);
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_changed);
    super.dispose();
  }

  /// A `/` typed at the start of an empty box opens the commands, filtered by what follows (D-07).
  /// The send button follows whether there is anything to send.
  void _changed() {
    final String text = widget.controller.text;
    final bool slashTyped = _before.isEmpty && text.startsWith('/') && !_picking;
    final bool emptied = _before.trim().isEmpty != text.trim().isEmpty;
    _before = text;

    if (slashTyped && widget.onOpenCommands != null && widget.state.isEnabled) {
      unawaited(_pick(text.substring(1)));
    }

    if (emptied) {
      setState(() {});
    }
  }

  /// Puts what the menu answered in the box, with the cursor after it — ready for the argument.
  Future<void> _pick(String query) async {
    final String? text = await widget.onOpenCommands?.call(query);

    if (text == null || !mounted) {
      return;
    }

    _picking = true;
    widget.controller.value = TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
    _picking = false;
  }

  void _send() {
    final String text = widget.controller.text.trim();

    if (text.isEmpty || widget.state.isBusy) {
      return;
    }

    final SendOutcome outcome = widget.onSend(text);

    setState(() => _notSent = outcome == SendOutcome.notSent);

    if (outcome == SendOutcome.sent) {
      widget.controller.clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    final ComposerState state = widget.state;
    final bool hasText = widget.controller.text.trim().isNotEmpty;
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ThemeData theme = Theme.of(context);
    final MediaQueryData media = MediaQuery.of(context);
    final double left = media.size.height - media.viewInsets.bottom - media.padding.vertical;

    return Material(
      color: theme.colorScheme.surfaceContainerLow,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Tokens.spaceSm, Tokens.spaceSm, Tokens.spaceSm, 0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            if (_notSent) _Said(l10n.sessionPromptRefused, error: true),
            if (state.isTurnRunning && hasText && !state.isClosed) _Said(l10n.composerQueued),
            ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: (left * boxShare).clamp(Tokens.touchTarget, double.infinity),
              ),
              child: TextField(
                controller: widget.controller,
                enabled: state.isEnabled,
                minLines: 1,
                maxLines: null,
                keyboardType: TextInputType.multiline,
                decoration: InputDecoration(
                  labelText: l10n.composerBoxLabel,
                  hintText: l10n.composerPlaceholder,
                  border: const OutlineInputBorder(),
                ),
              ),
            ),
            ComposerBar(
              mode: widget.mode,
              choices: widget.choices,
              onSlash: widget.onOpenCommands == null || !state.isEnabled
                  ? null
                  : () => unawaited(_pick('')),
              actions: _actions(l10n, state, hasText),
            ),
          ],
        ),
      ),
    );
  }

  /// Send, stop, or both (09 · D-06): a running turn with an empty box offers stop in the place of
  /// send; with text, send queues and stop stays beside it; an ended session has no stop.
  List<Widget> _actions(AppLocalizations l10n, ComposerState state, bool hasText) {
    final bool canStop = state.isTurnRunning && !state.isClosed && widget.onStop != null;

    if (canStop && !hasText) {
      return <Widget>[_stop(l10n, state)];
    }

    return <Widget>[if (canStop) _stop(l10n, state), _sendButton(l10n, state, hasText)];
  }

  Widget _stop(AppLocalizations l10n, ComposerState state) => IconButton.filledTonal(
    tooltip: l10n.composerStop,
    icon: const Icon(Icons.stop),
    onPressed: state.isEnabled && !state.isStopping ? widget.onStop : null,
  );

  Widget _sendButton(AppLocalizations l10n, ComposerState state, bool hasText) {
    final String label = sendLabel(l10n, state);
    final bool queues = state.isTurnRunning && !state.isClosed;

    return Semantics(
      // With an empty box the reason not to send is said here, and only here (09 · D-07): a line
      // on the screen for an empty box is noise the person has to read past every time.
      hint: hasText ? null : l10n.composerEmpty,
      child: IconButton.filled(
        tooltip: label,
        icon: Icon(queues ? Icons.playlist_add : Icons.send),
        onPressed: state.isEnabled && !state.isBusy && hasText ? _send : null,
      ),
    );
  }
}

/// What the send button says in [state]: waiting on its session, resuming, queueing, or sending.
String sendLabel(AppLocalizations l10n, ComposerState state) => switch (state) {
  ComposerState(isBusy: true, :final String busyLabel?) => busyLabel,
  ComposerState(isClosed: true) => l10n.sessionEndedResumeAndSend,
  ComposerState(isTurnRunning: true) => l10n.composerQueue,
  _ => l10n.sessionPromptAction,
};

/// One small sentence above the box.
class _Said extends StatelessWidget {
  const _Said(this.text, {this.error = false});

  final String text;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: Tokens.spaceSm),
      child: Semantics(
        liveRegion: true,
        child: Text(
          text,
          style: theme.textTheme.bodySmall?.copyWith(
            color: error ? theme.colorScheme.error : theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

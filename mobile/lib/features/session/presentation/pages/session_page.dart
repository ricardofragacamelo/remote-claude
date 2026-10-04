/// One live session, on a phone.
///
/// The session on screen is **navigation state**, so it comes from the route: pasting the link
/// or opening a notification lands here with the session already decided, and the screen attaches
/// to it rather than being told about it by whatever was on screen before.
///
/// Three bands (plan 10, B-06): the bar, the conversation — the only thing that scrolls — and the
/// composer, anchored over the keyboard. Every state is a line, never a card that pushes the box
/// off the screen (B-07). A session that ended keeps its box: sending resumes it (09 · D-05).
///
/// What happens in a turn is in the conversation (F4): the line that moves while it runs, the
/// question in the place of its tool, the pill over the box when that question is out of view, and
/// what a prompt offers when it is pressed and held.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/notifications/push_gateway.dart';
import 'package:remote_claude/core/notifications/push_providers.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/core/widgets/connection_line.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/presentation/providers/first_prompts.dart';
import 'package:remote_claude/features/session/presentation/providers/fork_controller.dart';
import 'package:remote_claude/features/session/presentation/providers/live_session_controller.dart';
import 'package:remote_claude/features/session/presentation/providers/open_sessions.dart';
import 'package:remote_claude/features/session/presentation/providers/resume_controller.dart';
import 'package:remote_claude/features/session/presentation/widgets/chat_composer.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_view.dart';
import 'package:remote_claude/features/session/presentation/widgets/folder_sessions_panel.dart';
import 'package:remote_claude/features/session/presentation/widgets/message_actions.dart';
import 'package:remote_claude/features/session/presentation/widgets/pending_pill.dart';
import 'package:remote_claude/features/session/presentation/widgets/rewind_sheet.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_body.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_dock.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_frame.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_menu.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_strips.dart';
import 'package:remote_claude/features/session/presentation/widgets/status_chip.dart';
import 'package:remote_claude/features/session/presentation/widgets/working_indicator.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The live session screen.
class SessionPage extends ConsumerStatefulWidget {
  const SessionPage({required this.sessionId, super.key, this.focusRequest});

  /// Which session. It comes from the route, never from a provider.
  final String sessionId;

  /// The question to open on, scrolled to its card — from the screen a notification opened (S-74).
  final String? focusRequest;

  @override
  ConsumerState<SessionPage> createState() => _SessionPageState();
}

class _SessionPageState extends ConsumerState<SessionPage> with BoxOwner<SessionPage> {
  /// The box starts with a first prompt that could not leave for this session, when there is one.
  @override
  String? initialText() => ref.read(firstPromptsProvider.notifier).takeText(widget.sessionId);

  /// Where the cards of the questions are, for the pill and the working line.
  final QuestionsInView _questions = QuestionsInView();

  /// What a resume of this ended session sends once it lands.
  String? _resumeText;

  /// The prompt being edited to be sent again from before it, if any (B-24).
  StreamMessage? _editing;

  /// The screen already went to the question it was opened on.
  bool _focused = false;

  String get _sessionId => widget.sessionId;

  LiveSessionController get _live => ref.read(liveSessionControllerProvider(_sessionId).notifier);

  /// Where the platform hears which session is on screen (D-10).
  late final PushGateway _push = ref.read(pushGatewayProvider);

  /// Follows the app in and out of the foreground: a session behind another app is not on screen.
  late final AppLifecycleListener _lifecycle = AppLifecycleListener(
    onShow: () => _showing(_sessionId),
    onHide: () => _showing(null),
  );

  @override
  void initState() {
    super.initState();
    _lifecycle;
    _showing(_sessionId);
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    _showing(null);
    _questions.dispose();
    super.dispose();
  }

  /// Tells the platform that [sessionId] is the one on screen — or that none is — so a question of
  /// it is not notified on top of its own card (S-76).
  void _showing(String? sessionId) => unawaited(_push.showingSession(sessionId));

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final LiveSession session = ref.watch(liveSessionControllerProvider(_sessionId));
    final ConnectionStatus connection = connectionOf(ref.watch(connectionStatusProvider));
    final PermissionQueue questions = ref.watch(permissionQueueControllerProvider(_sessionId));
    final String? folder = session.conversation.facts.workspacePath;

    _listen(session.conversation.facts);
    _goToFocusRequest(questions);
    _register(folder);

    final SessionDock dock = _dock(session, connection);

    return AppScreen(
      title: l10n.sessionTitle,
      titleEnd: StatusChip(sessionId: _sessionId, waiting: questions.pending.length),
      drawer: folder == null ? null : FolderSessionsPanel(folder: folder, current: _sessionId),
      actions: <Widget>[
        if (folder != null) FolderSessionsPanel.button(folder: folder, current: _sessionId),
        // Pushed, not gone to: "back" returns to this conversation with its scroll and its box.
        IconButton(
          icon: const Icon(Icons.history),
          tooltip: folder == null ? l10n.sessionHistoryUnknown : l10n.sessionHistoryOpen,
          onPressed: folder == null ? null : () => unawaited(context.push(historyRouteFor(folder))),
        ),
        SessionMenuButton(sessionId: _sessionId),
      ],
      body: SessionFrame(
        top: <Widget>[
          ConnectionStrip(status: connection),
          HistoryStrip(
            isLoading: session.isLoadingHistory,
            failure: session.historyFailure,
            onRetry: () => unawaited(_live.retryHistory()),
          ),
          const DeviceStatusLine(),
          const PushReachLine(),
        ],
        body: SessionBody(
          session: session,
          connection: connection,
          inline: InlineQuestions(
            sessionId: _sessionId,
            queue: questions,
            inView: _questions,
            onPlanApproved: _live.setPermissionMode,
          ),
          working: _working(l10n, session.conversation, questions),
          prompts: _prompts(l10n, session.conversation),
        ),
        aboveBox: dock.aboveBox(),
        composer: dock.composer(),
      ),
    );
  }

  /// Puts this session in its folder's panel once the folder is known — whichever way the screen was
  /// reached (plan 10, F9). After the frame: a provider is not changed while a widget builds.
  void _register(String? folder) {
    if (folder == null || ref.read(openSessionsProvider.notifier).contains(_sessionId)) {
      return;
    }

    WidgetsBinding.instance.addPostFrameCallback((Duration _) {
      if (mounted) {
        ref.read(openSessionsProvider.notifier).open(folder, _sessionId);
      }
    });
  }

  /// Goes to the question the screen was opened on, once its card is there to go to — once.
  void _goToFocusRequest(PermissionQueue questions) {
    final String? request = widget.focusRequest;

    if (_focused || request == null || questions.cardOf(request) == null) {
      return;
    }

    _focused = true;
    WidgetsBinding.instance.addPostFrameCallback((Duration _) => _questions.goTo(request));
  }

  /// What the screen follows to move elsewhere: the resume of this session, the fork of one of its
  /// prompts, and the plain resume offered when the CLI refused a fork.
  void _listen(SessionFacts facts) {
    final String? conversationId = facts.conversationId;
    final String? resumedFrom = facts.resumedFrom;

    if (conversationId != null) {
      ref.listen<ResumeState>(resumeControllerProvider(conversationId), _onResume);
    }

    if (resumedFrom != null && resumedFrom != conversationId) {
      ref.listen<ResumeState>(resumeControllerProvider(resumedFrom), _onResumedInstead);
    }

    ref.listen<ResumeState>(forkControllerProvider(_sessionId), _onFork);
  }

  SessionDock _dock(LiveSession session, ConnectionStatus connection) {
    final String? conversationId = session.conversation.facts.conversationId;

    return SessionDock(
      context: context,
      ref: ref,
      sessionId: _sessionId,
      box: box,
      session: session,
      connection: connection,
      resume: conversationId == null ? null : ref.watch(resumeControllerProvider(conversationId)),
      fork: ref.watch(forkControllerProvider(_sessionId)),
      questions: _questions,
      onResumeAndSend: _resumeAndSend,
      onForgetResume: _forgetResume,
      onSendEdit: _editing == null ? null : _sendEdit,
      onCancelEdit: _editing == null ? null : () => setState(() => _editing = null),
      onResumeInstead: _resumeInstead(session.conversation.facts),
    );
  }

  /// The line of the turn that runs — `null` when none does (B-18).
  Widget? _working(AppLocalizations l10n, Conversation conversation, PermissionQueue questions) {
    if (!conversation.isTurnRunning) {
      return null;
    }

    final String turn = turnKeyOf(_sessionId, conversation);
    final String? oldest = questions.pending.firstOrNull?.requestId;

    return WorkingIndicator(
      // A new turn is a new line, with its own clock.
      key: ValueKey<String>('working:$turn'),
      label: workingLabel(
        l10n,
        status: conversation.status,
        turn: turn,
        tool: conversation.runningTool?.toolName,
        waiting: questions.pending.length,
      ),
      since: DateTime.tryParse(conversation.turnStartedAt ?? ''),
      onGoToRequest: oldest == null ? null : () => _questions.goTo(oldest),
    );
  }

  /// What a prompt offers (B-24) — nothing until the conversation is known: a fork needs it.
  PromptActions? _prompts(AppLocalizations l10n, Conversation conversation) {
    if (conversation.facts.conversationId == null) {
      return null;
    }

    return PromptActions(
      onEdit: (StreamMessage prompt) => setState(() {
        _editing = prompt;
        box
          ..text = prompt.text
          ..selection = TextSelection.collapsed(offset: prompt.text.length);
      }),
      onFork: (StreamMessage prompt) => _fork(prompt, prompt.text),
      // A session that ended has no undo to offer, and no action for it (S-83).
      onUndo: conversation.status == SessionStatus.closed
          ? null
          : (StreamMessage prompt) =>
                unawaited(showRewindSheet(context, _sessionId, label: prompt.text)),
      undoBlocked: conversation.isTurnRunning ? l10n.sessionMessageUndoBusy : null,
    );
  }

  /// Opens the fork from before [prompt], to send [text] there.
  SendOutcome _fork(StreamMessage prompt, String text) {
    final SessionFacts facts = ref
        .read(liveSessionControllerProvider(_sessionId))
        .conversation
        .facts;
    final String? conversationId = facts.conversationId;

    if (conversationId == null) {
      return SendOutcome.notSent;
    }

    return ref
            .read(forkControllerProvider(_sessionId).notifier)
            .fork(
              workspacePath: facts.workspacePath ?? '',
              conversationId: conversationId,
              messageId: prompt.messageId,
              text: text,
            )
        ? SendOutcome.pending
        : SendOutcome.notSent;
  }

  /// Sends the box as the prompt being edited: a new conversation from before it (S-81).
  SendOutcome _sendEdit(String text) {
    final StreamMessage? editing = _editing;
    return editing == null ? SendOutcome.notSent : _fork(editing, text);
  }

  /// The fork opened: the screen moves to it, leaving the edit behind.
  void _onFork(ResumeState? previous, ResumeState next) {
    final String? landed = next.sessionId;

    if (landed == null || previous?.sessionId == landed) {
      return;
    }

    ref.read(forkControllerProvider(_sessionId).notifier).acknowledge();
    setState(() => _editing = null);
    context.go(sessionRouteFor(landed));
  }

  /// The plain resume of the conversation this session forked, when the CLI refused the point.
  VoidCallback? _resumeInstead(SessionFacts facts) {
    final String? resumedFrom = facts.resumedFrom;

    if (resumedFrom == null) {
      return null;
    }

    return () {
      _live.dismissFailures();
      ref.read(resumeControllerProvider(resumedFrom).notifier).resume(facts.workspacePath ?? '');
    };
  }

  /// The plain resume landed: the screen moves to it.
  void _onResumedInstead(ResumeState? previous, ResumeState next) {
    final String? landed = next.sessionId;
    final String? resumedFrom = ref
        .read(liveSessionControllerProvider(_sessionId))
        .conversation
        .facts
        .resumedFrom;

    if (landed == null || resumedFrom == null) {
      return;
    }

    ref.read(resumeControllerProvider(resumedFrom).notifier).acknowledge();
    context.go(sessionRouteFor(landed));
  }

  /// Forgets a refused resume and a refused fork, so their strip goes.
  void _forgetResume() {
    ref.read(forkControllerProvider(_sessionId).notifier).acknowledge();

    final String? conversationId = ref
        .read(liveSessionControllerProvider(_sessionId))
        .conversation
        .facts
        .conversationId;

    if (conversationId != null) {
      ref.read(resumeControllerProvider(conversationId).notifier).acknowledge();
    }
  }

  /// Sends in a session that ended: the conversation resumes in a new process — which counts
  /// against the ceiling, as the strip above the box says — and the prompt goes there (B-07).
  SendOutcome _resumeAndSend(String text) {
    final Conversation conversation = ref
        .read(liveSessionControllerProvider(_sessionId))
        .conversation;
    final String? conversationId = conversation.facts.conversationId;

    if (conversationId == null) {
      return SendOutcome.notSent;
    }

    _resumeText = text;
    ref
        .read(resumeControllerProvider(conversationId).notifier)
        .resume(conversation.facts.workspacePath ?? '');

    return ref.read(resumeControllerProvider(conversationId)).wasNotSent
        ? SendOutcome.notSent
        : SendOutcome.pending;
  }

  /// The resume landed: the prompt goes to the session that continues the conversation, and the
  /// screen moves there. A refusal leaves the text in the box, said above it (S-18).
  void _onResume(ResumeState? previous, ResumeState next) {
    final String? landed = next.sessionId;
    final String? text = _resumeText;
    final String? conversationId = ref
        .read(liveSessionControllerProvider(_sessionId))
        .conversation
        .facts
        .conversationId;

    if (landed == null || text == null || conversationId == null) {
      return;
    }

    _resumeText = null;
    ref.read(resumeControllerProvider(conversationId).notifier).acknowledge();
    ref.read(firstPromptsProvider.notifier).send(landed, text, remembersEffort: false);
    context.go(sessionRouteFor(landed));
  }
}

/// The address screen (plan 10, B-29): through which address this phone talks to the server — the
/// internal one, the external one, or another one typed here.
///
/// Reachable without signing in, from the sign-in screen, and outside the router's guard: a wrong
/// address saved must never lock the person out of the one screen that fixes it (R-13, S-108). With
/// a login open, changing the address ends it first — the next login is another issuer's (D-13).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/config/app_config_provider.dart';
import 'package:remote_claude/core/config/connection_choice.dart';
import 'package:remote_claude/core/config/connection_origin.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/core/widgets/help_button.dart';
import 'package:remote_claude/core/widgets/note_line.dart';
import 'package:remote_claude/features/auth/auth.dart';
import 'package:remote_claude/features/connection/domain/entities/probe_result.dart';
import 'package:remote_claude/features/connection/presentation/providers/connection_test_controller.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// Why [problem] keeps an address from being saved, in words.
String originProblem(AppLocalizations l10n, OriginProblem problem) => switch (problem) {
  OriginProblem.empty => l10n.connectionProblemEmpty,
  OriginProblem.notAnAddress => l10n.connectionProblemNotAnAddress,
  OriginProblem.scheme => l10n.connectionProblemScheme,
  OriginProblem.plainText => l10n.connectionProblemPlainText,
  OriginProblem.path => l10n.connectionProblemPath,
  OriginProblem.query => l10n.connectionProblemQuery,
  OriginProblem.fragment => l10n.connectionProblemFragment,
  OriginProblem.userInfo => l10n.connectionProblemUserInfo,
};

/// What a test answered, in words.
String probeSentence(AppLocalizations l10n, ProbeResult result, String origin) => switch (result) {
  ProbeResult.ok => l10n.connectionResultOk(origin),
  ProbeResult.serverUnreachable => l10n.connectionResultServerUnreachable(origin),
  ProbeResult.loginUnavailable => l10n.connectionResultLoginUnavailable(origin),
};

/// The address screen.
class ConnectionPage extends ConsumerStatefulWidget {
  const ConnectionPage({super.key});

  @override
  ConsumerState<ConnectionPage> createState() => _ConnectionPageState();
}

class _ConnectionPageState extends ConsumerState<ConnectionPage> {
  /// The radio on screen and the text of the third — local until saved.
  late ConnectionKind? _kind = ref.read(connectionControllerProvider).resolution.kind;
  late final TextEditingController _other = TextEditingController(
    text: ref.read(connectionControllerProvider).saved?.other ?? '',
  );

  /// A save is under way: nothing else leaves until it ends.
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _other.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _other.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final BuildConfig build = ref.watch(buildConfigProvider);
    final ConnectionSetting setting = ref.watch(connectionControllerProvider);
    final ConnectionTest test = ref.watch(connectionTestControllerProvider);
    final OriginCheck check = _check(build.origins);
    final String? origin = check is ValidOrigin ? check.origin : null;
    final bool busy = test.isTesting || _saving;
    // Watched, not read: whether somebody is signed in decides what saving does, and it has to be
    // known before the tap — with no address at all it is an error, and nobody is.
    final bool signedIn = ref.watch(authControllerProvider).value != null;

    return AppScreen(
      title: l10n.connectionTitle,
      actions: <Widget>[
        HelpButton(tooltip: l10n.connectionHelpOpen, body: l10n.connectionHelpBody),
      ],
      body: SingleChildScrollView(
        child: ContentColumn(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(l10n.connectionDescription),
            const SizedBox(height: Tokens.spaceSm),
            _Standing(setting: setting),
            _Radios(
              origins: build.origins,
              kind: _kind,
              other: _other,
              problem: check is InvalidOrigin && _kind == ConnectionKind.other
                  ? check.problem
                  : null,
              onKind: (ConnectionKind kind) => setState(() => _kind = kind),
            ),
            const SizedBox(height: Tokens.spaceMd),
            _Actions(
              test: test,
              onTest: origin == null || busy
                  ? null
                  : () =>
                        unawaited(ref.read(connectionTestControllerProvider.notifier).test(origin)),
              onSave: origin == null || busy ? null : () => unawaited(_save(signedIn: signedIn)),
            ),
          ],
        ),
      ),
    );
  }

  /// The address of the radio on screen, checked.
  OriginCheck _check(DefinedOrigins origins) => switch (_kind) {
    null => const InvalidOrigin(OriginProblem.empty),
    ConnectionKind.other => checkOrigin(_other.text),
    final ConnectionKind kind => switch (origins.of(ConnectionChoice(kind))) {
      final String origin => ValidOrigin(origin),
      null => const InvalidOrigin(OriginProblem.empty),
    },
  };

  /// Saves the choice — ending the login first when the address changes under one (S-101).
  Future<void> _save({required bool signedIn}) async {
    final ConnectionKind? kind = _kind;

    if (kind == null) {
      return;
    }

    final ConnectionChoice choice = ConnectionChoice(kind, other: _other.text.trim());
    final String? next = ref.read(buildConfigProvider).origins.of(choice);
    final bool moves = next != ref.read(currentOriginProvider);

    if (moves && signedIn && !await _confirmSwitch()) {
      return;
    }

    setState(() => _saving = true);

    if (moves && signedIn) {
      await ref.read(authControllerProvider.notifier).signOut();
    }

    await ref.read(connectionControllerProvider.notifier).save(choice);

    if (mounted) {
      setState(() => _saving = false);
      // Where the router sends a person with this address and this login: in, or to sign in.
      context.go(sessionRoute);
    }
  }

  Future<bool> _confirmSwitch() async {
    final AppLocalizations l10n = AppLocalizations.of(context);

    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialog) => AlertDialog(
        title: Text(l10n.connectionSwitchTitle),
        content: Text(l10n.connectionSwitchBody),
        actions: <Widget>[
          TextButton(
            autofocus: true,
            onPressed: () => Navigator.of(dialog).pop(false),
            child: Text(l10n.connectionSwitchCancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(true),
            child: Text(l10n.connectionSwitchConfirm),
          ),
        ],
      ),
    );

    return confirmed ?? false;
  }
}

/// Testing the address, what the test answered, and saving it.
class _Actions extends StatelessWidget {
  const _Actions({required this.test, required this.onTest, required this.onSave});

  final ConnectionTest test;

  /// `null` while nothing can be tested — no address, or a test or a save out.
  final VoidCallback? onTest;
  final VoidCallback? onSave;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ProbeResult? result = test.result;
    final String? tested = test.origin;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        OutlinedButton(
          onPressed: onTest,
          child: Text(test.isTesting ? l10n.connectionTesting : l10n.connectionTest),
        ),
        if (result != null && tested != null)
          Semantics(liveRegion: true, child: NoteLine(probeSentence(l10n, result, tested))),
        const SizedBox(height: Tokens.spaceSm),
        FilledButton(onPressed: onSave, child: Text(l10n.connectionSave)),
      ],
    );
  }
}

/// The address in use, or that there is none — and why the one saved is not the one in use.
class _Standing extends StatelessWidget {
  const _Standing({required this.setting});

  final ConnectionSetting setting;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ConnectionResolution resolution = setting.resolution;
    final String? origin = resolution.origin;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        NoteLine(origin == null ? l10n.connectionNone : l10n.connectionInUse(origin)),
        if (resolution.notice == ConnectionNotice.choiceUnavailable)
          NoteLine(l10n.connectionNoticeUnavailable),
      ],
    );
  }
}

/// The three radios, each with its address in full — or why it is off — and the field of the third.
class _Radios extends StatelessWidget {
  const _Radios({
    required this.origins,
    required this.kind,
    required this.other,
    required this.problem,
    required this.onKind,
  });

  final DefinedOrigins origins;
  final ConnectionKind? kind;
  final TextEditingController other;

  /// What is wrong with the typed address, while the third radio is chosen.
  final OriginProblem? problem;

  final void Function(ConnectionKind kind) onKind;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final OriginProblem? wrong = problem;

    return RadioGroup<ConnectionKind>(
      groupValue: kind,
      onChanged: (ConnectionKind? picked) {
        if (picked != null) {
          onKind(picked);
        }
      },
      child: Column(
        children: <Widget>[
          _defined(
            l10n,
            ConnectionKind.internal,
            l10n.connectionInternal,
            l10n.connectionInternalHint,
            origins.internal,
          ),
          _defined(
            l10n,
            ConnectionKind.external,
            l10n.connectionExternal,
            l10n.connectionExternalHint,
            origins.external,
          ),
          RadioListTile<ConnectionKind>(
            value: ConnectionKind.other,
            title: Text(l10n.connectionOther),
            contentPadding: EdgeInsets.zero,
          ),
          TextField(
            controller: other,
            enabled: kind == ConnectionKind.other,
            keyboardType: TextInputType.url,
            autocorrect: false,
            enableSuggestions: false,
            decoration: InputDecoration(
              labelText: l10n.connectionOtherLabel,
              hintText: l10n.connectionOtherHint,
              errorText: wrong == null ? null : originProblem(l10n, wrong),
              errorMaxLines: 4,
              border: const OutlineInputBorder(),
            ),
          ),
        ],
      ),
    );
  }

  /// A radio of an address the build defines — off, saying why, when it defines none (S-104).
  Widget _defined(
    AppLocalizations l10n,
    ConnectionKind value,
    String title,
    String hint,
    String? origin,
  ) => RadioListTile<ConnectionKind>(
    value: value,
    enabled: origin != null,
    title: Text(title),
    subtitle: Text(origin == null ? l10n.connectionUndefined : '$hint · $origin'),
    contentPadding: EdgeInsets.zero,
  );
}

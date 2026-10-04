/// The screen that asks who you are.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/core/widgets/error_view.dart';
import 'package:remote_claude/core/widgets/loading_view.dart';
import 'package:remote_claude/features/auth/domain/entities/auth_session.dart';
import 'package:remote_claude/features/auth/presentation/providers/auth_controller.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// Sign-in, in the system's external tab.
class SignInPage extends ConsumerWidget {
  const SignInPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ThemeData theme = Theme.of(context);
    final AsyncValue<AuthSession?> session = ref.watch(authControllerProvider);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: ContentColumn(
              padding: Tokens.spaceLg,
              children: <Widget>[
                Text(l10n.authSignInTitle, style: theme.textTheme.headlineSmall),
                const SizedBox(height: Tokens.spaceSm),
                Text(l10n.authSignInDescription, style: theme.textTheme.bodyMedium),
                const SizedBox(height: Tokens.spaceLg),
                switch (session) {
                  AsyncLoading<AuthSession?>() => LoadingView(label: l10n.authSignInPending),
                  AsyncError<AuthSession?>(:final Object error) => ErrorView(
                    failure: error is Failure ? error : const UnexpectedFailure(traceId: 'sign-in'),
                    onRetry: () => ref.read(authControllerProvider.notifier).signIn(),
                  ),
                  _ => FilledButton(
                    onPressed: () => ref.read(authControllerProvider.notifier).signIn(),
                    child: Text(l10n.authSignInAction),
                  ),
                },
                const SizedBox(height: Tokens.spaceMd),
                // The address screen, without signing in: a wrong address must never lock anybody
                // out of the one screen that fixes it (plan 10, R-13).
                TextButton.icon(
                  onPressed: () => unawaited(context.push(connectionRoute)),
                  icon: const Icon(Icons.dns_outlined),
                  label: Text(l10n.connectionTitle),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

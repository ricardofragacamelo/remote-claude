/// The application widget: theme, localisation and routing.
library;

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/app/router_provider.dart';
import 'package:remote_claude/app/session_scope.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The app.
class RemoteClaudeApp extends ConsumerWidget {
  const RemoteClaudeApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Alive for as long as the app is: it is what closes the socket on sign-out and opens it on
    // sign-in.
    ref.watch(sessionScopeProvider);

    return MaterialApp.router(
      onGenerateTitle: (BuildContext context) => AppLocalizations.of(context).appTitle,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      localizationsDelegates: const <LocalizationsDelegate<Object>>[
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      routerConfig: ref.watch(routerProvider),
    );
  }
}

/// Builds the world a widget test needs: providers, i18n and the theme.
///
/// Every widget test goes through it. Without a shared one, each test remounts the world in a
/// slightly different way and the suite drifts. Translation is the **real** catalogue, in `en`:
/// mocking it would hide a key that does not exist, which is exactly what the ARB is for.
library;

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// Pumps [child] inside the app's providers, theme and localisation.
extension PumpApp on WidgetTester {
  /// Mounts [child].
  ///
  /// [pumpOnce] is `false` when the test wants to see the very first frame — the one where an
  /// asynchronous provider is still undecided.
  Future<void> pumpApp(
    Widget child, {
    List<Override> overrides = const <Override>[],
    Locale locale = const Locale('en'),
    ThemeData? theme,
    bool pumpOnce = true,
  }) async {
    await pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          locale: locale,
          theme: theme ?? AppTheme.light(),
          localizationsDelegates: const <LocalizationsDelegate<Object>>[
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(body: child),
        ),
      ),
    );

    if (pumpOnce) {
      await pump();
    }
  }

  /// Mounts a screen that **navigates**, with a router it can navigate in.
  ///
  /// A screen calling `context.go` needs a `GoRouter` above it, and `home:` gives it none. The
  /// routes are the test's own so the destination can be a marker rather than a real screen:
  /// what is being proven is that the app went somewhere, and where.
  Future<void> pumpRouted(
    List<RouteBase> routes, {
    String initialLocation = '/',
    List<Override> overrides = const <Override>[],
    Locale locale = const Locale('en'),
    bool pumpOnce = true,
  }) async {
    final GoRouter router = GoRouter(initialLocation: initialLocation, routes: routes);
    addTearDown(router.dispose);

    await pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp.router(
          locale: locale,
          theme: AppTheme.light(),
          localizationsDelegates: const <LocalizationsDelegate<Object>>[
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: AppLocalizations.supportedLocales,
          routerConfig: router,
        ),
      ),
    );

    if (pumpOnce) {
      await pump();
    }
  }
}

/// The English catalogue, for a test that needs to name an expected sentence.
Future<AppLocalizations> englishCatalogue() => AppLocalizations.delegate.load(const Locale('en'));

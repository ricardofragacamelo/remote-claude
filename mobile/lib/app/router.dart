/// Routes, declared and addressable.
///
/// Not a convenience: a push notification has to open **one** screen, and that needs a named,
/// addressable route from day one. See docs/architecture/mobile/04-ui.md.
library;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/features/auth/auth.dart';
import 'package:remote_claude/features/session/session.dart';

/// Where the app goes when nobody said otherwise.
const String sessionRoute = '/';

/// Where an unauthenticated visitor is sent.
const String signInRoute = '/sign-in';

/// Decides the destination of one navigation.
///
/// Extracted from the router so the rule can be tested without building a widget tree. While the
/// session is still being restored the answer is `null` — **stay put**: redirecting on an
/// undecided state flashes the sign-in screen at someone who is already signed in.
String? redirectFor({required AsyncValue<AuthSession?> session, required String location}) {
  if (session.isLoading) {
    return null;
  }

  final bool signedIn = session.value != null;

  if (!signedIn && location != signInRoute) {
    return signInRoute;
  }

  if (signedIn && location == signInRoute) {
    return sessionRoute;
  }

  return null;
}

/// Builds the router.
GoRouter buildRouter(Ref ref) {
  final GoRouter router = GoRouter(
    initialLocation: sessionRoute,
    redirect: (BuildContext context, GoRouterState state) =>
        redirectFor(session: ref.read(authControllerProvider), location: state.matchedLocation),
    routes: <RouteBase>[
      GoRoute(
        path: sessionRoute,
        name: 'session',
        builder: (BuildContext context, GoRouterState state) => const SessionPingPage(),
      ),
      GoRoute(
        path: signInRoute,
        name: 'signIn',
        builder: (BuildContext context, GoRouterState state) => const SignInPage(),
      ),
    ],
  );

  // The guard lives in the router, not inside a widget: a redirect decided in `build` fires
  // after the wrong screen has already been shown.
  ref.listen(
    authControllerProvider,
    (AsyncValue<AuthSession?>? previous, AsyncValue<AuthSession?> next) => router.refresh(),
  );

  ref.onDispose(router.dispose);

  return router;
}

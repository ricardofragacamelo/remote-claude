/// Routes, declared and addressable.
///
/// Not a convenience: a push notification has to open **one** screen, and that needs a named,
/// addressable route from day one. See docs/architecture/mobile/04-ui.md.
library;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/navigation/deep_link_controller.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/features/auth/auth.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/workspace/workspace.dart';

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
      GoRoute(
        path: workspacesRoute,
        name: 'workspaces',
        builder: (BuildContext context, GoRouterState state) => const WorkspaceListPage(),
      ),
      GoRoute(
        path: rulesRoute,
        name: 'rules',
        builder: (BuildContext context, GoRouterState state) => const RulesPage(),
      ),
      GoRoute(
        path: '/sessions/:sessionId',
        name: 'session-live',
        builder: (BuildContext context, GoRouterState state) =>
            SessionPage(sessionId: state.pathParameters['sessionId'] ?? ''),
        routes: <RouteBase>[
          // A notification's target. Nested under its session, so "back" lands on the session the
          // request belongs to — and the screen revalidates against the server before it shows
          // anything, because the notification may be older than the request's fate (S-45).
          GoRoute(
            path: 'permissions/:requestId',
            name: 'session-permission',
            builder: (BuildContext context, GoRouterState state) => PermissionPage(
              sessionId: state.pathParameters['sessionId'] ?? '',
              requestId: state.pathParameters['requestId'] ?? '',
            ),
          ),
        ],
      ),
    ],
  );

  // The guard lives in the router, not inside a widget: a redirect decided in `build` fires
  // after the wrong screen has already been shown.
  ref.listen(
    authControllerProvider,
    (AsyncValue<AuthSession?>? previous, AsyncValue<AuthSession?> next) => router.refresh(),
  );

  // A tap on a notification arrives from the platform, with no widget involved. This is where it
  // becomes navigation — and the acknowledgement is what stops the app dragging itself back to
  // the same screen on every rebuild.
  ref.listen<String?>(deepLinkControllerProvider, (String? previous, String? location) {
    if (location != null) {
      ref.read(deepLinkControllerProvider.notifier).acknowledge();
      router.go(location);
    }
  });

  ref.onDispose(router.dispose);

  return router;
}

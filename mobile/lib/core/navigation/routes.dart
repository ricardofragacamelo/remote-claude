/// Every address in the app, spelled once.
///
/// In `core/` rather than in `app/`, and that is not tidiness: a notification opens a deep link
/// from inside a feature, and a feature that reached into `app/` for the path would close a
/// cycle — `app` builds the router from the features, and the feature would import `app` back.
/// The generator does not enjoy that cycle, and neither does anybody reading it.
library;

/// Where the app goes when nobody said otherwise.
const String sessionRoute = '/';

/// Where an unauthenticated visitor is sent.
const String signInRoute = '/sign-in';

/// The folders a session can be opened in.
const String workspacesRoute = '/workspaces';

/// What the user authorised in advance, and where it is taken back — a screen of its own, as on the
/// web ([D-04](../../../../docs/plans/03-rules-and-audit/decisions.md#d-04--onde-a-revogação-mora)).
const String rulesRoute = '/rules';

/// The address of one session.
///
/// Built rather than written out at each call site: it is the target of a deep link, and a link
/// spelled two ways is a link that works from one of them.
String sessionRouteFor(String sessionId) => '/sessions/$sessionId';

/// The address of one permission request, which is what a notification opens.
///
/// The screen it lands on revalidates against the server. The notification may have waited in the
/// tray while the request expired or somebody else answered it, so nothing there is rendered from
/// the payload (docs/architecture/mobile/03-state-and-data.md).
String permissionRouteFor(String sessionId, String requestId) =>
    '${sessionRouteFor(sessionId)}/permissions/$requestId';

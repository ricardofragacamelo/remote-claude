/// Every address in the app, spelled once.
///
/// In `core/` rather than in `app/`, and that is not tidiness: a notification opens a deep link
/// from inside a feature, and a feature that reached into `app/` for the path would close a
/// cycle — `app` builds the router from the features, and the feature would import `app` back.
/// The generator does not enjoy that cycle, and neither does anybody reading it.
library;

/// Where the app goes when nobody said otherwise: the folders home (plan 10, D-27).
const String sessionRoute = '/';

/// The round trip of the walking skeleton, reachable from the diagnostics (plan 10, D-27).
const String pingRoute = '/ping';

/// One folder: a new session, the sessions open in it, and its history (plan 10, F8).
const String folderRoute = '/folder';

/// The screen of [workspacePath]. The folder is a query parameter, for the reason the history's is.
String folderRouteFor(String workspacePath) => Uri(
  path: folderRoute,
  queryParameters: <String, String>{workspacePathParameter: workspacePath},
).toString();

/// One level of a folder, in the picker that opens one (plan 10, F7).
const String folderBrowseRoute = '/workspaces/browse';

/// The query parameter that names the folder being browsed.
const String browsePathParameter = 'path';

/// The listing of [path] in the picker.
String folderBrowseRouteFor(String path) => Uri(
  path: folderBrowseRoute,
  queryParameters: <String, String>{browsePathParameter: path},
).toString();

/// Where an unauthenticated visitor is sent.
const String signInRoute = '/sign-in';

/// Through which address the phone talks to the server — reachable with or without a login, and
/// where the app opens when it has no address at all (plan 10, B-29, D-17).
const String connectionRoute = '/connection';

/// The roots a folder can be opened from — the first level of the picker (plan 10, F7).
const String workspacesRoute = '/workspaces';

/// What the user authorised in advance, and where it is taken back — a screen of its own, as on the
/// web ([D-04](../../../../docs/plans/03-rules-and-audit/decisions.md#d-04--onde-a-revogação-mora)).
const String rulesRoute = '/rules';

/// What a person looks at, and switches `debug` on from, when something is not working.
const String diagnosticsRoute = '/diagnostics';

/// A new conversation in one folder, before it is a session — the draft (plan 10, D-05).
const String draftRoute = '/draft';

/// The draft of [workspacePath]. The folder is a query parameter, for the reason the history's is.
String draftRouteFor(String workspacePath) => Uri(
  path: draftRoute,
  queryParameters: <String, String>{workspacePathParameter: workspacePath},
).toString();

/// The address of one session.
///
/// Built rather than written out at each call site: it is the target of a deep link, and a link
/// spelled two ways is a link that works from one of them.
///
/// With [request], the conversation opens scrolled to the card of that question — where "open the
/// session" from a notification's screen lands (plan 10, B-22).
String sessionRouteFor(String sessionId, {String? request}) => request == null
    ? '/sessions/$sessionId'
    : Uri(
        path: '/sessions/$sessionId',
        queryParameters: <String, String>{requestParameter: request},
      ).toString();

/// The query parameter that names the question a session screen opens on.
const String requestParameter = 'request';

/// The address of one permission request, which is what a notification opens.
///
/// The screen it lands on revalidates against the server. The notification may have waited in the
/// tray while the request expired or somebody else answered it, so nothing there is rendered from
/// the payload (docs/architecture/mobile/03-state-and-data.md).
String permissionRouteFor(String sessionId, String requestId) =>
    '${sessionRouteFor(sessionId)}/permissions/$requestId';

/// The conversations of Claude's store, one workspace at a time — the second level of the
/// history ([04 · D-03](../../../../docs/plans/04-transcript-and-resume/decisions.md#d-03--a-forma-da-lista)).
const String historyRoute = '/history';

/// The query parameter that names the workspace of a history screen.
const String workspacePathParameter = 'workspacePath';

/// The conversations of one workspace.
///
/// The workspace is a query parameter rather than a path segment: it is an absolute path, and its
/// slashes would be segments of the address.
String historyRouteFor(String workspacePath) => Uri(
  path: historyRoute,
  queryParameters: <String, String>{workspacePathParameter: workspacePath},
).toString();

/// One conversation of the history, read-only, with the workspace it ran in — which is where a
/// resume of it has to run too.
String conversationRouteFor(String conversationId, String workspacePath) => Uri(
  path: '$historyRoute/${Uri.encodeComponent(conversationId)}',
  queryParameters: <String, String>{workspacePathParameter: workspacePath},
).toString();

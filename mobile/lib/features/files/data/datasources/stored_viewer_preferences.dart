/// The viewer's preferences, kept where the app keeps its others (plan 25, D-17, D-26).
library;

import 'package:remote_claude/core/storage/credential_store.dart';
import 'package:remote_claude/features/files/domain/repositories/viewer_preferences.dart';

/// Where the wrap of the viewer is kept — outside the credential keys, so signing out keeps it.
const String viewerWrapKey = 'rc.files.wrap';

/// [ViewerPreferences] in the app's store — the one the approval lock is kept in, rather than a
/// second storage dependency for one boolean. Anything but the literal `false` wraps.
class StoredViewerPreferences implements ViewerPreferences {
  const StoredViewerPreferences(this._store);

  final CredentialStore _store;

  @override
  Future<bool> wrap() async => await _store.read(viewerWrapKey) != 'false';

  @override
  Future<void> setWrap({required bool wrap}) => _store.write(viewerWrapKey, '$wrap');
}

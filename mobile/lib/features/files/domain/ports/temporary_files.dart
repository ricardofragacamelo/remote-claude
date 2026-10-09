/// Where a download is written before the "save as" (plan 25, B-27).
///
/// A port: the app's temporary directory is the platform's. Each download gets a folder of its
/// own, so two downloads of the same file never write over each other (S-130).
library;

/// The temporary files of the downloads.
abstract interface class TemporaryFiles {
  /// A new path for a file named [name], in a folder no other download uses.
  Future<String> create(String name);

  /// Deletes [path] and the folder [create] made for it — the phone's own file, never the folder's. Never throws: a temporary that could not
  /// be deleted is logged, and the system clears the directory in time.
  Future<void> discard(String path);
}

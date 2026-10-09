/// The system's "save as" (plan 25, B-26, D-14).
///
/// A port, because it is the platform's own dialog — the Storage Access Framework on Android, the
/// document picker on iOS —, which the `flutter test` does not open. The download writes the file
/// to a temporary of the app first; this hands it to the system, which asks the person where to.
/// No storage permission, in any version.
library;

/// What the person did with the dialog.
sealed class SaveOutcome {
  const SaveOutcome();
}

/// Saved where the person chose.
final class Saved extends SaveOutcome {
  const Saved();
}

/// The person closed the dialog: nothing was saved, and nothing went wrong.
final class SaveCancelled extends SaveOutcome {
  const SaveCancelled();
}

/// The system could not save — a full disk, a place that refused the file.
final class SaveFailed extends SaveOutcome {
  const SaveFailed(this.reason);

  /// The platform's own words, for the log — never shown as they are.
  final String reason;
}

/// Hands a file to the system's "save as".
abstract interface class FileSaver {
  /// Offers [temporaryPath] to be saved as [name], of [mimeType]. Never throws.
  Future<SaveOutcome> save({
    required String temporaryPath,
    required String name,
    required String mimeType,
  });
}

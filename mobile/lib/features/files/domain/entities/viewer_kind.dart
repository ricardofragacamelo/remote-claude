/// Which viewer opens a file (plan 25, B-14).
library;

/// The viewers of the app.
enum ViewerKind {
  /// Monospaced, numbered, virtualized lines — every file that is not one of the others.
  text,

  /// The preview of a markdown file, with its source one tap away.
  markdown,

  /// A PDF, scrolled page after page.
  pdf,

  /// An image, with zoom.
  image,
}

/// The rule that picks the viewer of a file (plan 25, B-14, discovery §7.1).
///
/// The extension picks, and the type the server read from the bytes confirms: a `.pdf` that is not
/// a PDF never reaches the PDF engine, and a `.png` that is not an image never reaches the decoder
/// (S-48). SVG is active content, and opens as text (D-08).
library;

import 'package:remote_claude/features/files/domain/entities/viewer_kind.dart';

const Set<String> _markdown = <String>{'md', 'markdown', 'mdx'};
const Set<String> _images = <String>{'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'};

/// The extension of [path], lower case — `''` for none, and for a name that only starts with a
/// dot (`.env`).
String extensionOf(String path) {
  final String name = path.split('/').last;
  final int dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.substring(dot + 1).toLowerCase();
}

/// The viewer [path] opens in, by its extension alone.
ViewerKind viewerFor(String path) {
  final String extension = extensionOf(path);

  if (_markdown.contains(extension)) {
    return ViewerKind.markdown;
  }
  if (extension == 'pdf') {
    return ViewerKind.pdf;
  }
  if (_images.contains(extension)) {
    return ViewerKind.image;
  }
  return ViewerKind.text;
}

/// Whether [contentType], read by the server from the bytes, confirms [kind] — the PDF and the
/// image need it; the others are read as text by the server itself.
bool confirms(ViewerKind kind, String? contentType) {
  final String type = (contentType ?? '').split(';').first.trim().toLowerCase();

  return switch (kind) {
    ViewerKind.pdf => type == 'application/pdf',
    ViewerKind.image => type.startsWith('image/') && type != 'image/svg+xml',
    _ => true,
  };
}

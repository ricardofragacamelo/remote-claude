/// Where a link of a file leads — the rule for content nobody reviewed (plan 25, B-20, R-04).
///
/// A relative link opens the viewer of that file, resolved against the folder of the file it is
/// in; one that climbs out of the open folder is refused before the server is asked (S-87).
/// `http`, `https` and `mailto` leave the app, after the person sees where to; every other scheme
/// — `javascript:`, `file:`, `data:`, `intent:`, one nobody knows — does not open (S-90).
library;

/// What a link is.
sealed class LinkTarget {
  const LinkTarget();
}

/// Another file of the folder: its path, and the anchor it pointed at, if any.
final class FileLink extends LinkTarget {
  const FileLink(this.path, {this.anchor});

  /// Relative to the open folder.
  final String path;
  final String? anchor;
}

/// A place outside the app, opened by the system after a confirmation.
final class OutsideLink extends LinkTarget {
  const OutsideLink(this.address);

  final Uri address;
}

/// Why a link does not open.
enum RefusedLink { outsideFolder, scheme, empty }

/// A link that does not open, and why.
final class Refused extends LinkTarget {
  const Refused(this.reason);

  final RefusedLink reason;
}

const Set<String> _outside = <String>{'http', 'https', 'mailto'};
final RegExp _scheme = RegExp(r'^[a-zA-Z][a-zA-Z0-9+.-]*:');

/// Where [href], found in the file at [from], leads.
LinkTarget resolveLink(String from, String href) {
  final String link = href.trim();
  if (link.isEmpty) {
    return const Refused(RefusedLink.empty);
  }

  if (_scheme.hasMatch(link) || link.startsWith('//')) {
    final Uri? address = Uri.tryParse(link);
    return address != null && _outside.contains(address.scheme.toLowerCase())
        ? OutsideLink(address)
        : const Refused(RefusedLink.scheme);
  }

  return _relative(from, link);
}

LinkTarget _relative(String from, String link) {
  final int hash = link.indexOf('#');
  final String anchor = hash < 0 ? '' : link.substring(hash + 1);
  final String target = (hash < 0 ? link : link.substring(0, hash)).split('?').first;

  if (target.isEmpty) {
    // `#section` — the same file.
    return FileLink(from, anchor: anchor.isEmpty ? null : anchor);
  }

  final List<String>? segments = _walk(
    target.startsWith('/') ? <String>[] : (from.split('/')..removeLast()),
    target,
  );
  if (segments == null) {
    return const Refused(RefusedLink.outsideFolder);
  }

  return segments.isEmpty
      ? const Refused(RefusedLink.empty)
      : FileLink(segments.join('/'), anchor: anchor.isEmpty ? null : anchor);
}

/// The segments of [target] walked from [start] — `null` when a `..` climbs out of the folder.
List<String>? _walk(List<String> start, String target) {
  final List<String> segments = start;
  for (final String raw in target.split('/')) {
    final String segment = _decoded(raw);
    if (segment == '..') {
      if (segments.isEmpty) {
        return null;
      }
      segments.removeLast();
    } else if (segment.isNotEmpty && segment != '.') {
      segments.add(segment);
    }
  }
  return segments;
}

/// [raw] with its `%20`s decoded — as it came, when it is not valid percent-encoding.
String _decoded(String raw) {
  try {
    return Uri.decodeComponent(raw);
  } on ArgumentError {
    return raw;
  }
}

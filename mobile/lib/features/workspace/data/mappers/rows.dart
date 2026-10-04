/// The rows of a list answer, read one by one.
library;

/// The rows under [key] of [payload], each read by [read], the unreadable ones dropped — one
/// malformed row should cost the person that row, not the screen.
List<T> rowsOf<T>(Object? payload, String key, T? Function(Object?) read) {
  final Object? rows = payload is Map<String, Object?> ? payload[key] : null;

  if (rows is! List<Object?>) {
    return <T>[];
  }

  return rows.map(read).whereType<T>().toList(growable: false);
}

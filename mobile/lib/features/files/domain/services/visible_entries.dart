/// What the panel shows of a level (plan 25, B-09).
library;

import 'package:remote_claude/features/files/domain/entities/file_entry.dart';

/// The entries of [listing] a person sees: the hidden ones only when [showHidden], and the order
/// the server gave, untouched — folders first, natural order (S-19).
List<FileEntry> visibleEntries(FileListing listing, {required bool showHidden}) => showHidden
    ? listing.entries
    : listing.entries.where((FileEntry entry) => !entry.hidden).toList(growable: false);

/// The level above [path] — `null` at the root of the folder, which has none to go to (S-31).
String? parentOf(String path) {
  if (path.isEmpty) {
    return null;
  }

  final int slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.substring(0, slash);
}

/// The steps from the root to [path], each with the level it leads to: `docs/plans` is
/// `('', ''), ('docs', 'docs'), ('plans', 'docs/plans')` — the root first, named by the caller.
List<({String name, String path})> breadcrumbOf(String path) {
  final List<({String name, String path})> steps = <({String name, String path})>[
    (name: '', path: ''),
  ];
  String sofar = '';

  for (final String segment in path.split('/').where((String each) => each.isNotEmpty)) {
    sofar = sofar.isEmpty ? segment : '$sofar/$segment';
    steps.add((name: segment, path: sofar));
  }

  return steps;
}

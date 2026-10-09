/// What the viewer shows of one file, and what it remembers for every file (plan 25, B-14…B-18).
library;

import 'dart:async';
import 'dart:typed_data';

import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/files/domain/entities/text_document.dart';
import 'package:remote_claude/features/files/files_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'file_view_controllers.g.dart';

/// The text of one file on screen.
class TextView extends Equatable {
  const TextView({this.document, this.failure, this.loading = false, this.changed = false});

  /// The text — kept while it is read again, so the screen never blinks.
  final TextDocument? document;

  /// Why the last read failed.
  final Failure? failure;

  /// A read is on its way.
  final bool loading;

  /// The last read brought another version than the one that was on screen (S-75).
  final bool changed;

  @override
  List<Object?> get props => <Object?>[document, failure, loading, changed];
}

/// The text of [path] in [folder], read again with its version — `304` keeps what is on screen
/// as it is (S-74), a new version replaces it and says so (S-75), and of two reads the newest one
/// asked is the one that counts (S-77).
@riverpod
class TextFileController extends _$TextFileController {
  int _asked = 0;

  @override
  TextView build(String folder, String path) {
    unawaited(_fetch(++_asked, null));
    return const TextView(loading: true);
  }

  /// Reads the file again, naming the version on screen.
  Future<void> reload() {
    final int ask = ++_asked;
    final TextDocument? shown = state.document;

    state = TextView(document: shown, loading: true, changed: state.changed);
    return _fetch(ask, shown);
  }

  /// The strip that said the file changed was read.
  void dismissChanged() => state = TextView(document: state.document, failure: state.failure);

  Future<void> _fetch(int ask, TextDocument? shown) async {
    try {
      final TextRead read = await ref.read(readTextFileProvider)(
        folder,
        path,
        ifNoneMatch: shown?.etag,
      );
      if (!ref.mounted || ask != _asked) {
        return;
      }
      state = switch (read) {
        TextUnchanged() => TextView(document: shown, changed: state.changed),
        TextChanged(:final TextDocument document) => TextView(
          document: document,
          changed: shown != null && shown.etag != document.etag,
        ),
      };
    } on Object catch (error) {
      if (ref.mounted && ask == _asked) {
        state = TextView(document: shown, failure: asFailure(error));
      }
    }
  }
}

/// A file's bytes, and the type the server read in them.
typedef RawBytes = ({Uint8List bytes, String? contentType});

/// The bytes of [path] in [folder], as a widget watches them.
AsyncValue<RawBytes> watchRawBytes(WidgetRef ref, String folder, String path) =>
    ref.watch(rawFileControllerProvider(folder, path));

/// The bytes of [path] in [folder] — an image — and the type the server read in them.
@riverpod
class RawFileController extends _$RawFileController {
  @override
  Future<RawBytes> build(String folder, String path) async {
    final RawFile raw = await ref.watch(readRawFileProvider)(folder, path);
    return (bytes: Uint8List.fromList(raw.bytes), contentType: raw.contentType);
  }

  /// Asks again.
  Future<void> retry() async {
    state = const AsyncValue<RawBytes>.loading();
    state = await AsyncValue.guard(() => build(folder, path));
  }
}

/// Whether long lines wrap, for every file — remembered on the phone (D-17).
@Riverpod(keepAlive: true)
class WrapSetting extends _$WrapSetting {
  @override
  bool build() {
    unawaited(_load());
    return true;
  }

  Future<void> _load() async {
    final bool stored = await ref.read(viewerPreferencesProvider).wrap();
    if (ref.mounted) {
      state = stored;
    }
  }

  /// Turns the wrap on or off, and remembers it.
  Future<void> toggle() async {
    state = !state;
    await ref.read(viewerPreferencesProvider).setWrap(wrap: state);
  }
}

// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'folder_sessions_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The live sessions of [workspacePath] and of the folders below it, from every device.
///
/// Read again when the screen comes back and when it is pulled — never pushed: a list is a
/// question with an answer (docs/architecture/shared/05-websocket-protocol.md). Only the newest
/// answer is kept: one that arrives after a newer question asked is dropped (S-152).

@ProviderFor(FolderSessionsController)
final folderSessionsControllerProvider = FolderSessionsControllerFamily._();

/// The live sessions of [workspacePath] and of the folders below it, from every device.
///
/// Read again when the screen comes back and when it is pulled — never pushed: a list is a
/// question with an answer (docs/architecture/shared/05-websocket-protocol.md). Only the newest
/// answer is kept: one that arrives after a newer question asked is dropped (S-152).
final class FolderSessionsControllerProvider
    extends $AsyncNotifierProvider<FolderSessionsController, List<LiveSessionSummary>> {
  /// The live sessions of [workspacePath] and of the folders below it, from every device.
  ///
  /// Read again when the screen comes back and when it is pulled — never pushed: a list is a
  /// question with an answer (docs/architecture/shared/05-websocket-protocol.md). Only the newest
  /// answer is kept: one that arrives after a newer question asked is dropped (S-152).
  FolderSessionsControllerProvider._({
    required FolderSessionsControllerFamily super.from,
    required String super.argument,
  }) : super(
         retry: _neverRetry,
         name: r'folderSessionsControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$folderSessionsControllerHash();

  @override
  String toString() {
    return r'folderSessionsControllerProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  FolderSessionsController create() => FolderSessionsController();

  @override
  bool operator ==(Object other) {
    return other is FolderSessionsControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$folderSessionsControllerHash() => r'427e530fe61d7a5b568ef148ea16b82d62a88839';

/// The live sessions of [workspacePath] and of the folders below it, from every device.
///
/// Read again when the screen comes back and when it is pulled — never pushed: a list is a
/// question with an answer (docs/architecture/shared/05-websocket-protocol.md). Only the newest
/// answer is kept: one that arrives after a newer question asked is dropped (S-152).

final class FolderSessionsControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          FolderSessionsController,
          AsyncValue<List<LiveSessionSummary>>,
          List<LiveSessionSummary>,
          FutureOr<List<LiveSessionSummary>>,
          String
        > {
  FolderSessionsControllerFamily._()
    : super(
        retry: _neverRetry,
        name: r'folderSessionsControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// The live sessions of [workspacePath] and of the folders below it, from every device.
  ///
  /// Read again when the screen comes back and when it is pulled — never pushed: a list is a
  /// question with an answer (docs/architecture/shared/05-websocket-protocol.md). Only the newest
  /// answer is kept: one that arrives after a newer question asked is dropped (S-152).

  FolderSessionsControllerProvider call(String workspacePath) =>
      FolderSessionsControllerProvider._(argument: workspacePath, from: this);

  @override
  String toString() => r'folderSessionsControllerProvider';
}

/// The live sessions of [workspacePath] and of the folders below it, from every device.
///
/// Read again when the screen comes back and when it is pulled — never pushed: a list is a
/// question with an answer (docs/architecture/shared/05-websocket-protocol.md). Only the newest
/// answer is kept: one that arrives after a newer question asked is dropped (S-152).

abstract class _$FolderSessionsController extends $AsyncNotifier<List<LiveSessionSummary>> {
  late final _$args = ref.$arg as String;
  String get workspacePath => _$args;

  FutureOr<List<LiveSessionSummary>> build(String workspacePath);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<List<LiveSessionSummary>>, List<LiveSessionSummary>>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<List<LiveSessionSummary>>, List<LiveSessionSummary>>,
              AsyncValue<List<LiveSessionSummary>>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args));
  }
}

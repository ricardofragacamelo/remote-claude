// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'folder_tree_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The panel of one folder — **per folder** and kept alive: closed and opened again, from the
/// session or from the folder's screen, it is where it was (S-39, S-45).

@ProviderFor(FolderTreeController)
final folderTreeControllerProvider = FolderTreeControllerFamily._();

/// The panel of one folder — **per folder** and kept alive: closed and opened again, from the
/// session or from the folder's screen, it is where it was (S-39, S-45).
final class FolderTreeControllerProvider
    extends $NotifierProvider<FolderTreeController, FolderTree> {
  /// The panel of one folder — **per folder** and kept alive: closed and opened again, from the
  /// session or from the folder's screen, it is where it was (S-39, S-45).
  FolderTreeControllerProvider._({
    required FolderTreeControllerFamily super.from,
    required String super.argument,
  }) : super(
         retry: null,
         name: r'folderTreeControllerProvider',
         isAutoDispose: false,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$folderTreeControllerHash();

  @override
  String toString() {
    return r'folderTreeControllerProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  FolderTreeController create() => FolderTreeController();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(FolderTree value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<FolderTree>(value));
  }

  @override
  bool operator ==(Object other) {
    return other is FolderTreeControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$folderTreeControllerHash() => r'd4ed2d9259ad313458c312121fc929b02a03f04c';

/// The panel of one folder — **per folder** and kept alive: closed and opened again, from the
/// session or from the folder's screen, it is where it was (S-39, S-45).

final class FolderTreeControllerFamily extends $Family
    with $ClassFamilyOverride<FolderTreeController, FolderTree, FolderTree, FolderTree, String> {
  FolderTreeControllerFamily._()
    : super(
        retry: null,
        name: r'folderTreeControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: false,
      );

  /// The panel of one folder — **per folder** and kept alive: closed and opened again, from the
  /// session or from the folder's screen, it is where it was (S-39, S-45).

  FolderTreeControllerProvider call(String folder) =>
      FolderTreeControllerProvider._(argument: folder, from: this);

  @override
  String toString() => r'folderTreeControllerProvider';
}

/// The panel of one folder — **per folder** and kept alive: closed and opened again, from the
/// session or from the folder's screen, it is where it was (S-39, S-45).

abstract class _$FolderTreeController extends $Notifier<FolderTree> {
  late final _$args = ref.$arg as String;
  String get folder => _$args;

  FolderTree build(String folder);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<FolderTree, FolderTree>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<FolderTree, FolderTree>,
              FolderTree,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args));
  }
}

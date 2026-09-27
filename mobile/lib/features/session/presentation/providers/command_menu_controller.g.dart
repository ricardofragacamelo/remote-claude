// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'command_menu_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The menu, keyed by the session whose installation it describes.
///
/// Read when the menu is opened and let go when it closes: the installation can change between two
/// openings, and the backend already keeps the list cached per CLI version (B-17). A failure here
/// never reaches the composer — the menu is discovery, not a boundary (S-31).

@ProviderFor(CommandMenuController)
final commandMenuControllerProvider = CommandMenuControllerFamily._();

/// The menu, keyed by the session whose installation it describes.
///
/// Read when the menu is opened and let go when it closes: the installation can change between two
/// openings, and the backend already keeps the list cached per CLI version (B-17). A failure here
/// never reaches the composer — the menu is discovery, not a boundary (S-31).
final class CommandMenuControllerProvider
    extends $AsyncNotifierProvider<CommandMenuController, CommandMenu> {
  /// The menu, keyed by the session whose installation it describes.
  ///
  /// Read when the menu is opened and let go when it closes: the installation can change between two
  /// openings, and the backend already keeps the list cached per CLI version (B-17). A failure here
  /// never reaches the composer — the menu is discovery, not a boundary (S-31).
  CommandMenuControllerProvider._({
    required CommandMenuControllerFamily super.from,
    required String super.argument,
  }) : super(
         retry: null,
         name: r'commandMenuControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$commandMenuControllerHash();

  @override
  String toString() {
    return r'commandMenuControllerProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  CommandMenuController create() => CommandMenuController();

  @override
  bool operator ==(Object other) {
    return other is CommandMenuControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$commandMenuControllerHash() => r'57f5533bf76063559d555fe8c5a5c5bd303d301b';

/// The menu, keyed by the session whose installation it describes.
///
/// Read when the menu is opened and let go when it closes: the installation can change between two
/// openings, and the backend already keeps the list cached per CLI version (B-17). A failure here
/// never reaches the composer — the menu is discovery, not a boundary (S-31).

final class CommandMenuControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          CommandMenuController,
          AsyncValue<CommandMenu>,
          CommandMenu,
          FutureOr<CommandMenu>,
          String
        > {
  CommandMenuControllerFamily._()
    : super(
        retry: null,
        name: r'commandMenuControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// The menu, keyed by the session whose installation it describes.
  ///
  /// Read when the menu is opened and let go when it closes: the installation can change between two
  /// openings, and the backend already keeps the list cached per CLI version (B-17). A failure here
  /// never reaches the composer — the menu is discovery, not a boundary (S-31).

  CommandMenuControllerProvider call(String sessionId) =>
      CommandMenuControllerProvider._(argument: sessionId, from: this);

  @override
  String toString() => r'commandMenuControllerProvider';
}

/// The menu, keyed by the session whose installation it describes.
///
/// Read when the menu is opened and let go when it closes: the installation can change between two
/// openings, and the backend already keeps the list cached per CLI version (B-17). A failure here
/// never reaches the composer — the menu is discovery, not a boundary (S-31).

abstract class _$CommandMenuController extends $AsyncNotifier<CommandMenu> {
  late final _$args = ref.$arg as String;
  String get sessionId => _$args;

  FutureOr<CommandMenu> build(String sessionId);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<CommandMenu>, CommandMenu>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<CommandMenu>, CommandMenu>,
              AsyncValue<CommandMenu>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args));
  }
}

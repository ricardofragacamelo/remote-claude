// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'file_view_controllers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The text of [path] in [folder], read again with its version — `304` keeps what is on screen
/// as it is (S-74), a new version replaces it and says so (S-75), and of two reads the newest one
/// asked is the one that counts (S-77).

@ProviderFor(TextFileController)
final textFileControllerProvider = TextFileControllerFamily._();

/// The text of [path] in [folder], read again with its version — `304` keeps what is on screen
/// as it is (S-74), a new version replaces it and says so (S-75), and of two reads the newest one
/// asked is the one that counts (S-77).
final class TextFileControllerProvider extends $NotifierProvider<TextFileController, TextView> {
  /// The text of [path] in [folder], read again with its version — `304` keeps what is on screen
  /// as it is (S-74), a new version replaces it and says so (S-75), and of two reads the newest one
  /// asked is the one that counts (S-77).
  TextFileControllerProvider._({
    required TextFileControllerFamily super.from,
    required (String, String) super.argument,
  }) : super(
         retry: null,
         name: r'textFileControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$textFileControllerHash();

  @override
  String toString() {
    return r'textFileControllerProvider'
        ''
        '$argument';
  }

  @$internal
  @override
  TextFileController create() => TextFileController();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(TextView value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<TextView>(value));
  }

  @override
  bool operator ==(Object other) {
    return other is TextFileControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$textFileControllerHash() => r'9382ddcf5227ce0065e765c6112f3828db79665d';

/// The text of [path] in [folder], read again with its version — `304` keeps what is on screen
/// as it is (S-74), a new version replaces it and says so (S-75), and of two reads the newest one
/// asked is the one that counts (S-77).

final class TextFileControllerFamily extends $Family
    with $ClassFamilyOverride<TextFileController, TextView, TextView, TextView, (String, String)> {
  TextFileControllerFamily._()
    : super(
        retry: null,
        name: r'textFileControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// The text of [path] in [folder], read again with its version — `304` keeps what is on screen
  /// as it is (S-74), a new version replaces it and says so (S-75), and of two reads the newest one
  /// asked is the one that counts (S-77).

  TextFileControllerProvider call(String folder, String path) =>
      TextFileControllerProvider._(argument: (folder, path), from: this);

  @override
  String toString() => r'textFileControllerProvider';
}

/// The text of [path] in [folder], read again with its version — `304` keeps what is on screen
/// as it is (S-74), a new version replaces it and says so (S-75), and of two reads the newest one
/// asked is the one that counts (S-77).

abstract class _$TextFileController extends $Notifier<TextView> {
  late final _$args = ref.$arg as (String, String);
  String get folder => _$args.$1;
  String get path => _$args.$2;

  TextView build(String folder, String path);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<TextView, TextView>;
    final element =
        ref.element
            as $ClassProviderElement<AnyNotifier<TextView, TextView>, TextView, Object?, Object?>;
    return element.handleCreate(ref, () => build(_$args.$1, _$args.$2));
  }
}

/// The bytes of [path] in [folder] — an image — and the type the server read in them.

@ProviderFor(RawFileController)
final rawFileControllerProvider = RawFileControllerFamily._();

/// The bytes of [path] in [folder] — an image — and the type the server read in them.
final class RawFileControllerProvider extends $AsyncNotifierProvider<RawFileController, RawBytes> {
  /// The bytes of [path] in [folder] — an image — and the type the server read in them.
  RawFileControllerProvider._({
    required RawFileControllerFamily super.from,
    required (String, String) super.argument,
  }) : super(
         retry: null,
         name: r'rawFileControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$rawFileControllerHash();

  @override
  String toString() {
    return r'rawFileControllerProvider'
        ''
        '$argument';
  }

  @$internal
  @override
  RawFileController create() => RawFileController();

  @override
  bool operator ==(Object other) {
    return other is RawFileControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$rawFileControllerHash() => r'ccfde88ba27c046b2c921f99ee1e8739a632fd59';

/// The bytes of [path] in [folder] — an image — and the type the server read in them.

final class RawFileControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          RawFileController,
          AsyncValue<RawBytes>,
          RawBytes,
          FutureOr<RawBytes>,
          (String, String)
        > {
  RawFileControllerFamily._()
    : super(
        retry: null,
        name: r'rawFileControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// The bytes of [path] in [folder] — an image — and the type the server read in them.

  RawFileControllerProvider call(String folder, String path) =>
      RawFileControllerProvider._(argument: (folder, path), from: this);

  @override
  String toString() => r'rawFileControllerProvider';
}

/// The bytes of [path] in [folder] — an image — and the type the server read in them.

abstract class _$RawFileController extends $AsyncNotifier<RawBytes> {
  late final _$args = ref.$arg as (String, String);
  String get folder => _$args.$1;
  String get path => _$args.$2;

  FutureOr<RawBytes> build(String folder, String path);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<RawBytes>, RawBytes>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<RawBytes>, RawBytes>,
              AsyncValue<RawBytes>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args.$1, _$args.$2));
  }
}

/// Whether long lines wrap, for every file — remembered on the phone (D-17).

@ProviderFor(WrapSetting)
final wrapSettingProvider = WrapSettingProvider._();

/// Whether long lines wrap, for every file — remembered on the phone (D-17).
final class WrapSettingProvider extends $NotifierProvider<WrapSetting, bool> {
  /// Whether long lines wrap, for every file — remembered on the phone (D-17).
  WrapSettingProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'wrapSettingProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$wrapSettingHash();

  @$internal
  @override
  WrapSetting create() => WrapSetting();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(bool value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<bool>(value));
  }
}

String _$wrapSettingHash() => r'596ff0a6f8b9b7b565d84e9a1ab914d237dff357';

/// Whether long lines wrap, for every file — remembered on the phone (D-17).

abstract class _$WrapSetting extends $Notifier<bool> {
  bool build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<bool, bool>;
    final element =
        ref.element as $ClassProviderElement<AnyNotifier<bool, bool>, bool, Object?, Object?>;
    return element.handleCreate(ref, build);
  }
}

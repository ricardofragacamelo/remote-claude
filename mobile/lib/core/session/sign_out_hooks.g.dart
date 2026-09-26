// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sign_out_hooks.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The one registry.

@ProviderFor(signOutHooks)
final signOutHooksProvider = SignOutHooksProvider._();

/// The one registry.

final class SignOutHooksProvider
    extends $FunctionalProvider<SignOutHooks, SignOutHooks, SignOutHooks>
    with $Provider<SignOutHooks> {
  /// The one registry.
  SignOutHooksProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'signOutHooksProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$signOutHooksHash();

  @$internal
  @override
  $ProviderElement<SignOutHooks> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  SignOutHooks create(Ref ref) {
    return signOutHooks(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(SignOutHooks value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<SignOutHooks>(value),
    );
  }
}

String _$signOutHooksHash() => r'd29924c0ed4ebc263c1bfc9ecdcdb685ce05e98b';

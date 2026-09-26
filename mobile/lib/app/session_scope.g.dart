// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'session_scope.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Keeps the socket and the user-scoped state in step with who is signed in.

@ProviderFor(sessionScope)
final sessionScopeProvider = SessionScopeProvider._();

/// Keeps the socket and the user-scoped state in step with who is signed in.

final class SessionScopeProvider extends $FunctionalProvider<void, void, void>
    with $Provider<void> {
  /// Keeps the socket and the user-scoped state in step with who is signed in.
  SessionScopeProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'sessionScopeProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$sessionScopeHash();

  @$internal
  @override
  $ProviderElement<void> $createElement($ProviderPointer pointer) => $ProviderElement(pointer);

  @override
  void create(Ref ref) {
    return sessionScope(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(void value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<void>(value));
  }
}

String _$sessionScopeHash() => r'eb2bdc6dafb910767db7b5799f8791edf609abf6';

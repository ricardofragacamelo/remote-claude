// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'first_prompts.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Every session sent a first prompt from here was opened here, and is claimed as this app's
/// ([OwnedSessions]).
///
/// The effort each session opened here started with, by session. A session absent from it was not
/// opened here, and its effort is not known.

@ProviderFor(FirstPrompts)
final firstPromptsProvider = FirstPromptsProvider._();

/// Every session sent a first prompt from here was opened here, and is claimed as this app's
/// ([OwnedSessions]).
///
/// The effort each session opened here started with, by session. A session absent from it was not
/// opened here, and its effort is not known.
final class FirstPromptsProvider extends $NotifierProvider<FirstPrompts, Map<String, String?>> {
  /// Every session sent a first prompt from here was opened here, and is claimed as this app's
  /// ([OwnedSessions]).
  ///
  /// The effort each session opened here started with, by session. A session absent from it was not
  /// opened here, and its effort is not known.
  FirstPromptsProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'firstPromptsProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$firstPromptsHash();

  @$internal
  @override
  FirstPrompts create() => FirstPrompts();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(Map<String, String?> value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<Map<String, String?>>(value),
    );
  }
}

String _$firstPromptsHash() => r'7924f4ed5935f88d7113031c38e9e56c332bc0a1';

/// Every session sent a first prompt from here was opened here, and is claimed as this app's
/// ([OwnedSessions]).
///
/// The effort each session opened here started with, by session. A session absent from it was not
/// opened here, and its effort is not known.

abstract class _$FirstPrompts extends $Notifier<Map<String, String?>> {
  Map<String, String?> build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<Map<String, String?>, Map<String, String?>>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<Map<String, String?>, Map<String, String?>>,
              Map<String, String?>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}

// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'transcript_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The history listing's edge of the backend.

@ProviderFor(transcriptApiDataSource)
final transcriptApiDataSourceProvider = TranscriptApiDataSourceProvider._();

/// The history listing's edge of the backend.

final class TranscriptApiDataSourceProvider
    extends
        $FunctionalProvider<
          TranscriptApiDataSource,
          TranscriptApiDataSource,
          TranscriptApiDataSource
        >
    with $Provider<TranscriptApiDataSource> {
  /// The history listing's edge of the backend.
  TranscriptApiDataSourceProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'transcriptApiDataSourceProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$transcriptApiDataSourceHash();

  @$internal
  @override
  $ProviderElement<TranscriptApiDataSource> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  TranscriptApiDataSource create(Ref ref) {
    return transcriptApiDataSource(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(TranscriptApiDataSource value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<TranscriptApiDataSource>(value),
    );
  }
}

String _$transcriptApiDataSourceHash() => r'38568bb537b1332c3ab87420a29cfbcf6da22249';

/// The transcript repository.

@ProviderFor(transcriptRepository)
final transcriptRepositoryProvider = TranscriptRepositoryProvider._();

/// The transcript repository.

final class TranscriptRepositoryProvider
    extends $FunctionalProvider<TranscriptRepository, TranscriptRepository, TranscriptRepository>
    with $Provider<TranscriptRepository> {
  /// The transcript repository.
  TranscriptRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'transcriptRepositoryProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$transcriptRepositoryHash();

  @$internal
  @override
  $ProviderElement<TranscriptRepository> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  TranscriptRepository create(Ref ref) {
    return transcriptRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(TranscriptRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<TranscriptRepository>(value),
    );
  }
}

String _$transcriptRepositoryHash() => r'b470e801854af9d1bf875cf0f22a4c2e698be1f0';

/// Lists the conversations of a workspace.

@ProviderFor(listConversations)
final listConversationsProvider = ListConversationsProvider._();

/// Lists the conversations of a workspace.

final class ListConversationsProvider
    extends $FunctionalProvider<ListConversations, ListConversations, ListConversations>
    with $Provider<ListConversations> {
  /// Lists the conversations of a workspace.
  ListConversationsProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'listConversationsProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$listConversationsHash();

  @$internal
  @override
  $ProviderElement<ListConversations> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ListConversations create(Ref ref) {
    return listConversations(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ListConversations value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ListConversations>(value),
    );
  }
}

String _$listConversationsHash() => r'0f0b61ba2d29dea4e16d6460ccc5fd44da023149';

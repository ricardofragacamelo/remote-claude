// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'audit_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The trail's edge of the backend.

@ProviderFor(auditApiDataSource)
final auditApiDataSourceProvider = AuditApiDataSourceProvider._();

/// The trail's edge of the backend.

final class AuditApiDataSourceProvider
    extends $FunctionalProvider<AuditApiDataSource, AuditApiDataSource, AuditApiDataSource>
    with $Provider<AuditApiDataSource> {
  /// The trail's edge of the backend.
  AuditApiDataSourceProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'auditApiDataSourceProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$auditApiDataSourceHash();

  @$internal
  @override
  $ProviderElement<AuditApiDataSource> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  AuditApiDataSource create(Ref ref) {
    return auditApiDataSource(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(AuditApiDataSource value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<AuditApiDataSource>(value),
    );
  }
}

String _$auditApiDataSourceHash() => r'0b9d3a4ba9f8e02beab1d391ac694a9fc0d4de24';

/// The trail repository.

@ProviderFor(auditRepository)
final auditRepositoryProvider = AuditRepositoryProvider._();

/// The trail repository.

final class AuditRepositoryProvider
    extends $FunctionalProvider<AuditRepository, AuditRepository, AuditRepository>
    with $Provider<AuditRepository> {
  /// The trail repository.
  AuditRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'auditRepositoryProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$auditRepositoryHash();

  @$internal
  @override
  $ProviderElement<AuditRepository> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  AuditRepository create(Ref ref) {
    return auditRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(AuditRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<AuditRepository>(value),
    );
  }
}

String _$auditRepositoryHash() => r'bc60a4f488e1d4984663a430f1bbac523bdc2883';

/// Reads the trail of a session and a kind of call.

@ProviderFor(readAuditTrail)
final readAuditTrailProvider = ReadAuditTrailProvider._();

/// Reads the trail of a session and a kind of call.

final class ReadAuditTrailProvider
    extends $FunctionalProvider<ReadAuditTrail, ReadAuditTrail, ReadAuditTrail>
    with $Provider<ReadAuditTrail> {
  /// Reads the trail of a session and a kind of call.
  ReadAuditTrailProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'readAuditTrailProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$readAuditTrailHash();

  @$internal
  @override
  $ProviderElement<ReadAuditTrail> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ReadAuditTrail create(Ref ref) {
    return readAuditTrail(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ReadAuditTrail value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ReadAuditTrail>(value),
    );
  }
}

String _$readAuditTrailHash() => r'29195a71c0d1bf1e2b3b37980da4088170b0e61e';

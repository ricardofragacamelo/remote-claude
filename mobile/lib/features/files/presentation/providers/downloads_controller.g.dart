// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'downloads_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The downloads, by number. They outlive the screen they started on: closing the panel or the
/// viewer does not stop one.

@ProviderFor(Downloads)
final downloadsProvider = DownloadsProvider._();

/// The downloads, by number. They outlive the screen they started on: closing the panel or the
/// viewer does not stop one.
final class DownloadsProvider extends $NotifierProvider<Downloads, Map<int, DownloadTask>> {
  /// The downloads, by number. They outlive the screen they started on: closing the panel or the
  /// viewer does not stop one.
  DownloadsProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'downloadsProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$downloadsHash();

  @$internal
  @override
  Downloads create() => Downloads();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(Map<int, DownloadTask> value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<Map<int, DownloadTask>>(value),
    );
  }
}

String _$downloadsHash() => r'a08cf924bebd62017d4919b450e91cec77a83198';

/// The downloads, by number. They outlive the screen they started on: closing the panel or the
/// viewer does not stop one.

abstract class _$Downloads extends $Notifier<Map<int, DownloadTask>> {
  Map<int, DownloadTask> build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<Map<int, DownloadTask>, Map<int, DownloadTask>>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<Map<int, DownloadTask>, Map<int, DownloadTask>>,
              Map<int, DownloadTask>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}

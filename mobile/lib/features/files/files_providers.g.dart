// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'files_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The file routes' edge of the backend.

@ProviderFor(filesApiDataSource)
final filesApiDataSourceProvider = FilesApiDataSourceProvider._();

/// The file routes' edge of the backend.

final class FilesApiDataSourceProvider
    extends $FunctionalProvider<FilesApiDataSource, FilesApiDataSource, FilesApiDataSource>
    with $Provider<FilesApiDataSource> {
  /// The file routes' edge of the backend.
  FilesApiDataSourceProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'filesApiDataSourceProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$filesApiDataSourceHash();

  @$internal
  @override
  $ProviderElement<FilesApiDataSource> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  FilesApiDataSource create(Ref ref) {
    return filesApiDataSource(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(FilesApiDataSource value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<FilesApiDataSource>(value),
    );
  }
}

String _$filesApiDataSourceHash() => r'89b5e17b6b3eda0882734c062dc4e60f90e6eb9e';

/// The files repository — one per origin, so the ceilings it keeps are that server's.

@ProviderFor(filesRepository)
final filesRepositoryProvider = FilesRepositoryProvider._();

/// The files repository — one per origin, so the ceilings it keeps are that server's.

final class FilesRepositoryProvider
    extends $FunctionalProvider<FilesRepository, FilesRepository, FilesRepository>
    with $Provider<FilesRepository> {
  /// The files repository — one per origin, so the ceilings it keeps are that server's.
  FilesRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'filesRepositoryProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$filesRepositoryHash();

  @$internal
  @override
  $ProviderElement<FilesRepository> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  FilesRepository create(Ref ref) {
    return filesRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(FilesRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<FilesRepository>(value),
    );
  }
}

String _$filesRepositoryHash() => r'c7eaeb950433635da745744e2f86238fef16dc9d';

/// One level of a folder.

@ProviderFor(listLevel)
final listLevelProvider = ListLevelProvider._();

/// One level of a folder.

final class ListLevelProvider extends $FunctionalProvider<ListLevel, ListLevel, ListLevel>
    with $Provider<ListLevel> {
  /// One level of a folder.
  ListLevelProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'listLevelProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$listLevelHash();

  @$internal
  @override
  $ProviderElement<ListLevel> $createElement($ProviderPointer pointer) => $ProviderElement(pointer);

  @override
  ListLevel create(Ref ref) {
    return listLevel(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ListLevel value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<ListLevel>(value));
  }
}

String _$listLevelHash() => r'e0107eda0de1ef5a39d6f027a96c84b0055479e0';

/// The ceilings of the file routes.

@ProviderFor(readFileLimits)
final readFileLimitsProvider = ReadFileLimitsProvider._();

/// The ceilings of the file routes.

final class ReadFileLimitsProvider
    extends $FunctionalProvider<ReadFileLimits, ReadFileLimits, ReadFileLimits>
    with $Provider<ReadFileLimits> {
  /// The ceilings of the file routes.
  ReadFileLimitsProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'readFileLimitsProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$readFileLimitsHash();

  @$internal
  @override
  $ProviderElement<ReadFileLimits> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ReadFileLimits create(Ref ref) {
    return readFileLimits(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ReadFileLimits value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ReadFileLimits>(value),
    );
  }
}

String _$readFileLimitsHash() => r'04cb04699dc8f8eab7a10697561842fa01b68914';

/// The text of a file.

@ProviderFor(readTextFile)
final readTextFileProvider = ReadTextFileProvider._();

/// The text of a file.

final class ReadTextFileProvider
    extends $FunctionalProvider<ReadTextFile, ReadTextFile, ReadTextFile>
    with $Provider<ReadTextFile> {
  /// The text of a file.
  ReadTextFileProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'readTextFileProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$readTextFileHash();

  @$internal
  @override
  $ProviderElement<ReadTextFile> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ReadTextFile create(Ref ref) {
    return readTextFile(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ReadTextFile value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ReadTextFile>(value),
    );
  }
}

String _$readTextFileHash() => r'b0e0a9c40c69c33aa389c4cc1d58e6fe6c2e288b';

/// The bytes of a file.

@ProviderFor(readRawFile)
final readRawFileProvider = ReadRawFileProvider._();

/// The bytes of a file.

final class ReadRawFileProvider extends $FunctionalProvider<ReadRawFile, ReadRawFile, ReadRawFile>
    with $Provider<ReadRawFile> {
  /// The bytes of a file.
  ReadRawFileProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'readRawFileProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$readRawFileHash();

  @$internal
  @override
  $ProviderElement<ReadRawFile> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ReadRawFile create(Ref ref) {
    return readRawFile(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ReadRawFile value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ReadRawFile>(value),
    );
  }
}

String _$readRawFileHash() => r'06ea2f77a368c59ff7f07287f9cb32d50978ec10';

/// What the viewer remembers on this phone.

@ProviderFor(viewerPreferences)
final viewerPreferencesProvider = ViewerPreferencesProvider._();

/// What the viewer remembers on this phone.

final class ViewerPreferencesProvider
    extends $FunctionalProvider<ViewerPreferences, ViewerPreferences, ViewerPreferences>
    with $Provider<ViewerPreferences> {
  /// What the viewer remembers on this phone.
  ViewerPreferencesProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'viewerPreferencesProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$viewerPreferencesHash();

  @$internal
  @override
  $ProviderElement<ViewerPreferences> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ViewerPreferences create(Ref ref) {
    return viewerPreferences(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ViewerPreferences value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ViewerPreferences>(value),
    );
  }
}

String _$viewerPreferencesHash() => r'aac27f7783c712178bd609f0ef8ad6a3b8df8ea3';

/// The engine of the diagrams — Mermaid in a WebView off screen (ADR-024). One for the app: its
/// start is paid once.

@ProviderFor(diagramEngine)
final diagramEngineProvider = DiagramEngineProvider._();

/// The engine of the diagrams — Mermaid in a WebView off screen (ADR-024). One for the app: its
/// start is paid once.

final class DiagramEngineProvider
    extends $FunctionalProvider<DiagramEngine, DiagramEngine, DiagramEngine>
    with $Provider<DiagramEngine> {
  /// The engine of the diagrams — Mermaid in a WebView off screen (ADR-024). One for the app: its
  /// start is paid once.
  DiagramEngineProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'diagramEngineProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$diagramEngineHash();

  @$internal
  @override
  $ProviderElement<DiagramEngine> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  DiagramEngine create(Ref ref) {
    return diagramEngine(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(DiagramEngine value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<DiagramEngine>(value),
    );
  }
}

String _$diagramEngineHash() => r'09fd6842267af73be5a12ac765ed56e345d92d10';

/// The diagrams, one at a time, within ceilings, and kept.

@ProviderFor(diagramQueue)
final diagramQueueProvider = DiagramQueueProvider._();

/// The diagrams, one at a time, within ceilings, and kept.

final class DiagramQueueProvider
    extends $FunctionalProvider<DiagramQueue, DiagramQueue, DiagramQueue>
    with $Provider<DiagramQueue> {
  /// The diagrams, one at a time, within ceilings, and kept.
  DiagramQueueProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'diagramQueueProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$diagramQueueHash();

  @$internal
  @override
  $ProviderElement<DiagramQueue> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  DiagramQueue create(Ref ref) {
    return diagramQueue(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(DiagramQueue value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<DiagramQueue>(value),
    );
  }
}

String _$diagramQueueHash() => r'852bb7d601c05f8e3ca2c10ec36f4cd90e0cf37e';

/// A file of the folder, read by ranges.

@ProviderFor(openFileReader)
final openFileReaderProvider = OpenFileReaderProvider._();

/// A file of the folder, read by ranges.

final class OpenFileReaderProvider
    extends $FunctionalProvider<OpenFileReader, OpenFileReader, OpenFileReader>
    with $Provider<OpenFileReader> {
  /// A file of the folder, read by ranges.
  OpenFileReaderProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'openFileReaderProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$openFileReaderHash();

  @$internal
  @override
  $ProviderElement<OpenFileReader> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  OpenFileReader create(Ref ref) {
    return openFileReader(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(OpenFileReader value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<OpenFileReader>(value),
    );
  }
}

String _$openFileReaderHash() => r'f3af999ac7ddb0ab6e741484ab0f938c6e7b388f';

/// The system's "save as" — the platform's dialog, by the app's own channel (D-14).

@ProviderFor(fileSaver)
final fileSaverProvider = FileSaverProvider._();

/// The system's "save as" — the platform's dialog, by the app's own channel (D-14).

final class FileSaverProvider extends $FunctionalProvider<FileSaver, FileSaver, FileSaver>
    with $Provider<FileSaver> {
  /// The system's "save as" — the platform's dialog, by the app's own channel (D-14).
  FileSaverProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'fileSaverProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$fileSaverHash();

  @$internal
  @override
  $ProviderElement<FileSaver> $createElement($ProviderPointer pointer) => $ProviderElement(pointer);

  @override
  FileSaver create(Ref ref) {
    return fileSaver(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(FileSaver value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<FileSaver>(value));
  }
}

String _$fileSaverHash() => r'84967ba662ed76a2de10788aada283f446569b5a';

/// Where the downloads are written before the "save as".

@ProviderFor(temporaryFiles)
final temporaryFilesProvider = TemporaryFilesProvider._();

/// Where the downloads are written before the "save as".

final class TemporaryFilesProvider
    extends $FunctionalProvider<TemporaryFiles, TemporaryFiles, TemporaryFiles>
    with $Provider<TemporaryFiles> {
  /// Where the downloads are written before the "save as".
  TemporaryFilesProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'temporaryFilesProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$temporaryFilesHash();

  @$internal
  @override
  $ProviderElement<TemporaryFiles> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  TemporaryFiles create(Ref ref) {
    return temporaryFiles(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(TemporaryFiles value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<TemporaryFiles>(value),
    );
  }
}

String _$temporaryFilesHash() => r'0baad9483b0e61c78a2b921b9d3635dca34d465d';

/// A file downloaded and handed to the "save as".

@ProviderFor(downloadFile)
final downloadFileProvider = DownloadFileProvider._();

/// A file downloaded and handed to the "save as".

final class DownloadFileProvider
    extends $FunctionalProvider<DownloadFile, DownloadFile, DownloadFile>
    with $Provider<DownloadFile> {
  /// A file downloaded and handed to the "save as".
  DownloadFileProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'downloadFileProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$downloadFileHash();

  @$internal
  @override
  $ProviderElement<DownloadFile> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  DownloadFile create(Ref ref) {
    return downloadFile(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(DownloadFile value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<DownloadFile>(value),
    );
  }
}

String _$downloadFileHash() => r'f156645d6488fe98b64258073254551d95353070';

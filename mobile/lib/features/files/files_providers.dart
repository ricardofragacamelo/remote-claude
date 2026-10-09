/// Wiring of the file browser: its composition root (plan 25).
///
/// Same reason as the auth feature's — see `auth_providers.dart`. The repository follows the
/// address in use: a new origin is a new installation, with its own ceilings (S-23).
library;

import 'package:remote_claude/core/config/app_config_provider.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/network/api_client_provider.dart';
import 'package:remote_claude/core/storage/credential_store_provider.dart';
import 'package:remote_claude/features/files/data/datasources/files_api_data_source.dart';
import 'package:remote_claude/features/files/data/datasources/stored_viewer_preferences.dart';
import 'package:remote_claude/features/files/data/engines/app_temporary_files.dart';
import 'package:remote_claude/features/files/data/engines/channel_file_saver.dart';
import 'package:remote_claude/features/files/data/engines/webview_diagram_engine.dart';
import 'package:remote_claude/features/files/data/repositories/files_repository_impl.dart';
import 'package:remote_claude/features/files/domain/ports/diagram_engine.dart';
import 'package:remote_claude/features/files/domain/ports/file_saver.dart';
import 'package:remote_claude/features/files/domain/ports/temporary_files.dart';
import 'package:remote_claude/features/files/domain/repositories/files_repository.dart';
import 'package:remote_claude/features/files/domain/services/diagram_queue.dart';
import 'package:remote_claude/features/files/domain/repositories/viewer_preferences.dart';
import 'package:remote_claude/features/files/domain/usecases/download_file.dart';
import 'package:remote_claude/features/files/domain/usecases/read_folder.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'files_providers.g.dart';

/// The file routes' edge of the backend.
@Riverpod(keepAlive: true)
FilesApiDataSource filesApiDataSource(Ref ref) =>
    HttpFilesApiDataSource(ref.watch(apiClientProvider));

/// The files repository — one per origin, so the ceilings it keeps are that server's.
@Riverpod(keepAlive: true)
FilesRepository filesRepository(Ref ref) {
  ref.watch(appConfigProvider);
  return FilesRepositoryImpl(ref.watch(filesApiDataSourceProvider));
}

/// One level of a folder.
@Riverpod(keepAlive: true)
ListLevel listLevel(Ref ref) => ListLevel(ref.watch(filesRepositoryProvider));

/// The ceilings of the file routes.
@Riverpod(keepAlive: true)
ReadFileLimits readFileLimits(Ref ref) => ReadFileLimits(ref.watch(filesRepositoryProvider));

/// The text of a file.
@Riverpod(keepAlive: true)
ReadTextFile readTextFile(Ref ref) => ReadTextFile(ref.watch(filesRepositoryProvider));

/// The bytes of a file.
@Riverpod(keepAlive: true)
ReadRawFile readRawFile(Ref ref) => ReadRawFile(ref.watch(filesRepositoryProvider));

/// What the viewer remembers on this phone.
@Riverpod(keepAlive: true)
ViewerPreferences viewerPreferences(Ref ref) =>
    StoredViewerPreferences(ref.watch(credentialStoreProvider));

/// The engine of the diagrams — Mermaid in a WebView off screen (ADR-024). One for the app: its
/// start is paid once.
@Riverpod(keepAlive: true)
DiagramEngine diagramEngine(Ref ref) => WebViewDiagramEngine();

/// The diagrams, one at a time, within ceilings, and kept.
@Riverpod(keepAlive: true)
DiagramQueue diagramQueue(Ref ref) => DiagramQueue(ref.watch(diagramEngineProvider));

/// A file of the folder, read by ranges.
@Riverpod(keepAlive: true)
OpenFileReader openFileReader(Ref ref) => OpenFileReader(ref.watch(filesRepositoryProvider));

/// The system's "save as" — the platform's dialog, by the app's own channel (D-14).
@Riverpod(keepAlive: true)
FileSaver fileSaver(Ref ref) => ChannelFileSaver(logger: ref.watch(appLoggerProvider));

/// Where the downloads are written before the "save as".
@Riverpod(keepAlive: true)
TemporaryFiles temporaryFiles(Ref ref) => AppTemporaryFiles(logger: ref.watch(appLoggerProvider));

/// A file downloaded and handed to the "save as".
@Riverpod(keepAlive: true)
DownloadFile downloadFile(Ref ref) => DownloadFile(
  ref.watch(filesRepositoryProvider),
  ref.watch(temporaryFilesProvider),
  ref.watch(fileSaverProvider),
);

// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'session_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The session's edge of the socket.

@ProviderFor(sessionWsDataSource)
final sessionWsDataSourceProvider = SessionWsDataSourceProvider._();

/// The session's edge of the socket.

final class SessionWsDataSourceProvider
    extends $FunctionalProvider<SessionWsDataSource, SessionWsDataSource, SessionWsDataSource>
    with $Provider<SessionWsDataSource> {
  /// The session's edge of the socket.
  SessionWsDataSourceProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'sessionWsDataSourceProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$sessionWsDataSourceHash();

  @$internal
  @override
  $ProviderElement<SessionWsDataSource> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  SessionWsDataSource create(Ref ref) {
    return sessionWsDataSource(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(SessionWsDataSource value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<SessionWsDataSource>(value),
    );
  }
}

String _$sessionWsDataSourceHash() => r'3e586f8ab4eeb0af00efdfb4db493d3258b8d289';

/// The session repository.

@ProviderFor(sessionRepository)
final sessionRepositoryProvider = SessionRepositoryProvider._();

/// The session repository.

final class SessionRepositoryProvider
    extends $FunctionalProvider<SessionRepository, SessionRepository, SessionRepository>
    with $Provider<SessionRepository> {
  /// The session repository.
  SessionRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'sessionRepositoryProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$sessionRepositoryHash();

  @$internal
  @override
  $ProviderElement<SessionRepository> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  SessionRepository create(Ref ref) {
    return sessionRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(SessionRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<SessionRepository>(value),
    );
  }
}

String _$sessionRepositoryHash() => r'05a83f7715f2ebd085d603538b5ba653e1396e9b';

/// Watches a session's stream.

@ProviderFor(watchSession)
final watchSessionProvider = WatchSessionProvider._();

/// Watches a session's stream.

final class WatchSessionProvider
    extends $FunctionalProvider<WatchSession, WatchSession, WatchSession>
    with $Provider<WatchSession> {
  /// Watches a session's stream.
  WatchSessionProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'watchSessionProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$watchSessionHash();

  @$internal
  @override
  $ProviderElement<WatchSession> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  WatchSession create(Ref ref) {
    return watchSession(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(WatchSession value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<WatchSession>(value),
    );
  }
}

String _$watchSessionHash() => r'78b2430db65d45e62e6b268432cc9d4ed65ad68a';

/// Sends the one command of the walking skeleton.

@ProviderFor(pingSession)
final pingSessionProvider = PingSessionProvider._();

/// Sends the one command of the walking skeleton.

final class PingSessionProvider extends $FunctionalProvider<PingSession, PingSession, PingSession>
    with $Provider<PingSession> {
  /// Sends the one command of the walking skeleton.
  PingSessionProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'pingSessionProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$pingSessionHash();

  @$internal
  @override
  $ProviderElement<PingSession> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  PingSession create(Ref ref) {
    return pingSession(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(PingSession value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<PingSession>(value),
    );
  }
}

String _$pingSessionHash() => r'40cc230b798c043bfaa96b9988b65eedfafda57f';

/// Drives a session: start, prompt, interrupt and close.

@ProviderFor(driveSession)
final driveSessionProvider = DriveSessionProvider._();

/// Drives a session: start, prompt, interrupt and close.

final class DriveSessionProvider
    extends $FunctionalProvider<DriveSession, DriveSession, DriveSession>
    with $Provider<DriveSession> {
  /// Drives a session: start, prompt, interrupt and close.
  DriveSessionProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'driveSessionProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$driveSessionHash();

  @$internal
  @override
  $ProviderElement<DriveSession> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  DriveSession create(Ref ref) {
    return driveSession(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(DriveSession value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<DriveSession>(value),
    );
  }
}

String _$driveSessionHash() => r'37ec9df60e56e3f8d2de2d72e3043a32dc7888f4';

/// The history's edge of the backend.

@ProviderFor(historyApiDataSource)
final historyApiDataSourceProvider = HistoryApiDataSourceProvider._();

/// The history's edge of the backend.

final class HistoryApiDataSourceProvider
    extends $FunctionalProvider<HistoryApiDataSource, HistoryApiDataSource, HistoryApiDataSource>
    with $Provider<HistoryApiDataSource> {
  /// The history's edge of the backend.
  HistoryApiDataSourceProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'historyApiDataSourceProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$historyApiDataSourceHash();

  @$internal
  @override
  $ProviderElement<HistoryApiDataSource> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  HistoryApiDataSource create(Ref ref) {
    return historyApiDataSource(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(HistoryApiDataSource value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<HistoryApiDataSource>(value),
    );
  }
}

String _$historyApiDataSourceHash() => r'982f264ce0551d2216572cee6c10bf0d4b6e311b';

/// The history repository.

@ProviderFor(historyRepository)
final historyRepositoryProvider = HistoryRepositoryProvider._();

/// The history repository.

final class HistoryRepositoryProvider
    extends $FunctionalProvider<HistoryRepository, HistoryRepository, HistoryRepository>
    with $Provider<HistoryRepository> {
  /// The history repository.
  HistoryRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'historyRepositoryProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$historyRepositoryHash();

  @$internal
  @override
  $ProviderElement<HistoryRepository> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  HistoryRepository create(Ref ref) {
    return historyRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(HistoryRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<HistoryRepository>(value),
    );
  }
}

String _$historyRepositoryHash() => r'dd20741e9b64610b836478e9909ffadd9857de40';

/// Reads a page of a conversation's history.

@ProviderFor(readHistory)
final readHistoryProvider = ReadHistoryProvider._();

/// Reads a page of a conversation's history.

final class ReadHistoryProvider extends $FunctionalProvider<ReadHistory, ReadHistory, ReadHistory>
    with $Provider<ReadHistory> {
  /// Reads a page of a conversation's history.
  ReadHistoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'readHistoryProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$readHistoryHash();

  @$internal
  @override
  $ProviderElement<ReadHistory> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ReadHistory create(Ref ref) {
    return readHistory(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ReadHistory value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ReadHistory>(value),
    );
  }
}

String _$readHistoryHash() => r'5f716618425ab37076f5e6a695cc2cd1ac90c331';

/// The routes of what a conversation's timeline only marks: a tool's whole output, a prompt's
/// image (plan 22, B-32, B-33).

@ProviderFor(transcriptContentApiDataSource)
final transcriptContentApiDataSourceProvider = TranscriptContentApiDataSourceProvider._();

/// The routes of what a conversation's timeline only marks: a tool's whole output, a prompt's
/// image (plan 22, B-32, B-33).

final class TranscriptContentApiDataSourceProvider
    extends
        $FunctionalProvider<
          TranscriptContentApiDataSource,
          TranscriptContentApiDataSource,
          TranscriptContentApiDataSource
        >
    with $Provider<TranscriptContentApiDataSource> {
  /// The routes of what a conversation's timeline only marks: a tool's whole output, a prompt's
  /// image (plan 22, B-32, B-33).
  TranscriptContentApiDataSourceProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'transcriptContentApiDataSourceProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$transcriptContentApiDataSourceHash();

  @$internal
  @override
  $ProviderElement<TranscriptContentApiDataSource> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  TranscriptContentApiDataSource create(Ref ref) {
    return transcriptContentApiDataSource(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(TranscriptContentApiDataSource value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<TranscriptContentApiDataSource>(value),
    );
  }
}

String _$transcriptContentApiDataSourceHash() => r'd7c981a88e58a8bafa64e0a88d7c919862d224fa';

/// The content repository.

@ProviderFor(transcriptContentRepository)
final transcriptContentRepositoryProvider = TranscriptContentRepositoryProvider._();

/// The content repository.

final class TranscriptContentRepositoryProvider
    extends
        $FunctionalProvider<
          TranscriptContentRepository,
          TranscriptContentRepository,
          TranscriptContentRepository
        >
    with $Provider<TranscriptContentRepository> {
  /// The content repository.
  TranscriptContentRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'transcriptContentRepositoryProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$transcriptContentRepositoryHash();

  @$internal
  @override
  $ProviderElement<TranscriptContentRepository> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  TranscriptContentRepository create(Ref ref) {
    return transcriptContentRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(TranscriptContentRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<TranscriptContentRepository>(value),
    );
  }
}

String _$transcriptContentRepositoryHash() => r'33959123cbdbe715043d96e370503ac69368706c';

/// Opens a tool's whole output and a prompt's image.

@ProviderFor(readTranscriptContent)
final readTranscriptContentProvider = ReadTranscriptContentProvider._();

/// Opens a tool's whole output and a prompt's image.

final class ReadTranscriptContentProvider
    extends $FunctionalProvider<ReadTranscriptContent, ReadTranscriptContent, ReadTranscriptContent>
    with $Provider<ReadTranscriptContent> {
  /// Opens a tool's whole output and a prompt's image.
  ReadTranscriptContentProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'readTranscriptContentProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$readTranscriptContentHash();

  @$internal
  @override
  $ProviderElement<ReadTranscriptContent> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ReadTranscriptContent create(Ref ref) {
    return readTranscriptContent(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ReadTranscriptContent value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ReadTranscriptContent>(value),
    );
  }
}

String _$readTranscriptContentHash() => r'fd92129e8a47fcc2a7e39e362da85daa22e7f21e';

/// The socket's edge for following conversations of the history (plan 22, B-24).

@ProviderFor(transcriptFollowWsDataSource)
final transcriptFollowWsDataSourceProvider = TranscriptFollowWsDataSourceProvider._();

/// The socket's edge for following conversations of the history (plan 22, B-24).

final class TranscriptFollowWsDataSourceProvider
    extends
        $FunctionalProvider<
          TranscriptFollowWsDataSource,
          TranscriptFollowWsDataSource,
          TranscriptFollowWsDataSource
        >
    with $Provider<TranscriptFollowWsDataSource> {
  /// The socket's edge for following conversations of the history (plan 22, B-24).
  TranscriptFollowWsDataSourceProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'transcriptFollowWsDataSourceProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$transcriptFollowWsDataSourceHash();

  @$internal
  @override
  $ProviderElement<TranscriptFollowWsDataSource> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  TranscriptFollowWsDataSource create(Ref ref) {
    return transcriptFollowWsDataSource(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(TranscriptFollowWsDataSource value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<TranscriptFollowWsDataSource>(value),
    );
  }
}

String _$transcriptFollowWsDataSourceHash() => r'0c4ae89692685a51cfb4aab8551258a71d7aef8d';

/// The follow repository.

@ProviderFor(transcriptFollowRepository)
final transcriptFollowRepositoryProvider = TranscriptFollowRepositoryProvider._();

/// The follow repository.

final class TranscriptFollowRepositoryProvider
    extends
        $FunctionalProvider<
          TranscriptFollowRepository,
          TranscriptFollowRepository,
          TranscriptFollowRepository
        >
    with $Provider<TranscriptFollowRepository> {
  /// The follow repository.
  TranscriptFollowRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'transcriptFollowRepositoryProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$transcriptFollowRepositoryHash();

  @$internal
  @override
  $ProviderElement<TranscriptFollowRepository> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  TranscriptFollowRepository create(Ref ref) {
    return transcriptFollowRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(TranscriptFollowRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<TranscriptFollowRepository>(value),
    );
  }
}

String _$transcriptFollowRepositoryHash() => r'716b8cb7c5ddfdaa7647bb0ca0d3aa6fbcbb88a9';

/// Follows a conversation of the history while another client writes it.

@ProviderFor(followTranscript)
final followTranscriptProvider = FollowTranscriptProvider._();

/// Follows a conversation of the history while another client writes it.

final class FollowTranscriptProvider
    extends $FunctionalProvider<FollowTranscript, FollowTranscript, FollowTranscript>
    with $Provider<FollowTranscript> {
  /// Follows a conversation of the history while another client writes it.
  FollowTranscriptProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'followTranscriptProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$followTranscriptHash();

  @$internal
  @override
  $ProviderElement<FollowTranscript> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  FollowTranscript create(Ref ref) {
    return followTranscript(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(FollowTranscript value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<FollowTranscript>(value),
    );
  }
}

String _$followTranscriptHash() => r'569963828bccd1bd264451df45ee4c93af20ee44';

/// The endpoints of a live session that answer a question: its commands and its undo points.

@ProviderFor(sessionApiDataSource)
final sessionApiDataSourceProvider = SessionApiDataSourceProvider._();

/// The endpoints of a live session that answer a question: its commands and its undo points.

final class SessionApiDataSourceProvider
    extends $FunctionalProvider<SessionApiDataSource, SessionApiDataSource, SessionApiDataSource>
    with $Provider<SessionApiDataSource> {
  /// The endpoints of a live session that answer a question: its commands and its undo points.
  SessionApiDataSourceProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'sessionApiDataSourceProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$sessionApiDataSourceHash();

  @$internal
  @override
  $ProviderElement<SessionApiDataSource> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  SessionApiDataSource create(Ref ref) {
    return sessionApiDataSource(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(SessionApiDataSource value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<SessionApiDataSource>(value),
    );
  }
}

String _$sessionApiDataSourceHash() => r'b56cde37698e1c42162ee5ccc4376dc76dfe69de';

/// The command repository.

@ProviderFor(commandRepository)
final commandRepositoryProvider = CommandRepositoryProvider._();

/// The command repository.

final class CommandRepositoryProvider
    extends $FunctionalProvider<CommandRepository, CommandRepository, CommandRepository>
    with $Provider<CommandRepository> {
  /// The command repository.
  CommandRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'commandRepositoryProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$commandRepositoryHash();

  @$internal
  @override
  $ProviderElement<CommandRepository> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  CommandRepository create(Ref ref) {
    return commandRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(CommandRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<CommandRepository>(value),
    );
  }
}

String _$commandRepositoryHash() => r'fba17602b6efc77a4f27df2d704e689effaff86d';

/// Reads the commands of a session's installation.

@ProviderFor(listCommands)
final listCommandsProvider = ListCommandsProvider._();

/// Reads the commands of a session's installation.

final class ListCommandsProvider
    extends $FunctionalProvider<ListCommands, ListCommands, ListCommands>
    with $Provider<ListCommands> {
  /// Reads the commands of a session's installation.
  ListCommandsProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'listCommandsProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$listCommandsHash();

  @$internal
  @override
  $ProviderElement<ListCommands> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ListCommands create(Ref ref) {
    return listCommands(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ListCommands value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ListCommands>(value),
    );
  }
}

String _$listCommandsHash() => r'f6890b33f4a96b6e2f3ef06b90e5323d227de82b';

/// The checkpoint repository.

@ProviderFor(checkpointRepository)
final checkpointRepositoryProvider = CheckpointRepositoryProvider._();

/// The checkpoint repository.

final class CheckpointRepositoryProvider
    extends $FunctionalProvider<CheckpointRepository, CheckpointRepository, CheckpointRepository>
    with $Provider<CheckpointRepository> {
  /// The checkpoint repository.
  CheckpointRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'checkpointRepositoryProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$checkpointRepositoryHash();

  @$internal
  @override
  $ProviderElement<CheckpointRepository> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  CheckpointRepository create(Ref ref) {
    return checkpointRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(CheckpointRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<CheckpointRepository>(value),
    );
  }
}

String _$checkpointRepositoryHash() => r'444c67b3416935af44fad646e0e42f500f8f8316';

/// Reads the undo points of a session.

@ProviderFor(listCheckpoints)
final listCheckpointsProvider = ListCheckpointsProvider._();

/// Reads the undo points of a session.

final class ListCheckpointsProvider
    extends $FunctionalProvider<ListCheckpoints, ListCheckpoints, ListCheckpoints>
    with $Provider<ListCheckpoints> {
  /// Reads the undo points of a session.
  ListCheckpointsProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'listCheckpointsProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$listCheckpointsHash();

  @$internal
  @override
  $ProviderElement<ListCheckpoints> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ListCheckpoints create(Ref ref) {
    return listCheckpoints(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ListCheckpoints value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ListCheckpoints>(value),
    );
  }
}

String _$listCheckpointsHash() => r'b16a6d53aeee6bef8120ff1dcdaef60eab185122';

/// The insight repository: the catalogue, the models and the context.

@ProviderFor(insightRepository)
final insightRepositoryProvider = InsightRepositoryProvider._();

/// The insight repository: the catalogue, the models and the context.

final class InsightRepositoryProvider
    extends $FunctionalProvider<InsightRepository, InsightRepository, InsightRepository>
    with $Provider<InsightRepository> {
  /// The insight repository: the catalogue, the models and the context.
  InsightRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'insightRepositoryProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$insightRepositoryHash();

  @$internal
  @override
  $ProviderElement<InsightRepository> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  InsightRepository create(Ref ref) {
    return insightRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(InsightRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<InsightRepository>(value),
    );
  }
}

String _$insightRepositoryHash() => r'580f6e2202dc8dee4728e822e778fb68e2dc8e5a';

/// Reads the catalogue of a folder, and the models and context of a session.

@ProviderFor(readInsight)
final readInsightProvider = ReadInsightProvider._();

/// Reads the catalogue of a folder, and the models and context of a session.

final class ReadInsightProvider extends $FunctionalProvider<ReadInsight, ReadInsight, ReadInsight>
    with $Provider<ReadInsight> {
  /// Reads the catalogue of a folder, and the models and context of a session.
  ReadInsightProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'readInsightProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$readInsightHash();

  @$internal
  @override
  $ProviderElement<ReadInsight> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ReadInsight create(Ref ref) {
    return readInsight(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ReadInsight value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ReadInsight>(value),
    );
  }
}

String _$readInsightHash() => r'd8512d926eb54e5607ca2536cb07f17e21a96f96';

/// The live sessions of a folder (plan 10, F8).

@ProviderFor(liveSessionRepository)
final liveSessionRepositoryProvider = LiveSessionRepositoryProvider._();

/// The live sessions of a folder (plan 10, F8).

final class LiveSessionRepositoryProvider
    extends $FunctionalProvider<LiveSessionRepository, LiveSessionRepository, LiveSessionRepository>
    with $Provider<LiveSessionRepository> {
  /// The live sessions of a folder (plan 10, F8).
  LiveSessionRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'liveSessionRepositoryProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$liveSessionRepositoryHash();

  @$internal
  @override
  $ProviderElement<LiveSessionRepository> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  LiveSessionRepository create(Ref ref) {
    return liveSessionRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(LiveSessionRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<LiveSessionRepository>(value),
    );
  }
}

String _$liveSessionRepositoryHash() => r'0a52ca959f9557a3fdb6c3a141c8acaaafa24b7b';

/// Lists what runs in a folder.

@ProviderFor(listLiveSessions)
final listLiveSessionsProvider = ListLiveSessionsProvider._();

/// Lists what runs in a folder.

final class ListLiveSessionsProvider
    extends $FunctionalProvider<ListLiveSessions, ListLiveSessions, ListLiveSessions>
    with $Provider<ListLiveSessions> {
  /// Lists what runs in a folder.
  ListLiveSessionsProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'listLiveSessionsProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$listLiveSessionsHash();

  @$internal
  @override
  $ProviderElement<ListLiveSessions> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ListLiveSessions create(Ref ref) {
    return listLiveSessions(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ListLiveSessions value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ListLiveSessions>(value),
    );
  }
}

String _$listLiveSessionsHash() => r'96c01cab79f2f50d849f5a8dba363b19c4286d88';

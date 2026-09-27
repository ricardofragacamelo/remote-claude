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

String _$sessionWsDataSourceHash() => r'2861736adf06de53d11ea3874cf29351f794f1ab';

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

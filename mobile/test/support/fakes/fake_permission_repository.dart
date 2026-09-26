/// Permissions without a socket, an HTTP client or a plugin: the test decides what the server says
/// and records what the app sent.
library;

import 'dart:async';

import 'package:flutter_riverpod/misc.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_event.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_lookup.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/domain/repositories/approval_lock.dart';
import 'package:remote_claude/features/permission/domain/repositories/permission_repository.dart';
import 'package:remote_claude/features/permission/permission_providers.dart';

/// One answer the app sent.
class SentAnswer {
  const SentAnswer({
    required this.frameId,
    required this.requestId,
    required this.decision,
    required this.scope,
    this.reason,
  });

  final String frameId;
  final String requestId;
  final PermissionDecision decision;
  final PermissionScope scope;
  final String? reason;
}

/// A feed the test pushes events into.
class FakePermissionFeed implements PermissionFeed {
  FakePermissionFeed(this.sessionId);

  final String sessionId;
  final StreamController<PermissionEvent> _events = StreamController<PermissionEvent>.broadcast();

  /// Every answer that left, in order.
  final List<SentAnswer> answers = <SentAnswer>[];

  /// Every extension asked for.
  final List<String> extensions = <String>[];

  /// Whether the socket is "ready". When `false`, nothing leaves.
  bool connected = true;

  bool closed = false;

  @override
  Stream<PermissionEvent> get events => _events.stream;

  /// Delivers [event] as if the server had sent it.
  void emit(PermissionEvent event) => _events.add(event);

  @override
  bool answer({
    required String frameId,
    required String requestId,
    required PermissionDecision decision,
    required PermissionScope scope,
    String? reason,
  }) {
    if (!connected) {
      return false;
    }

    answers.add(
      SentAnswer(
        frameId: frameId,
        requestId: requestId,
        decision: decision,
        scope: scope,
        reason: reason,
      ),
    );
    return true;
  }

  @override
  bool extend(String requestId) {
    if (!connected) {
      return false;
    }

    extensions.add(requestId);
    return true;
  }

  @override
  void close() {
    closed = true;
    unawaited(_events.close());
  }
}

/// [PermissionRepository] the test drives.
class FakePermissionRepository implements PermissionRepository {
  /// Every feed opened, in order — one per screen that watched a session.
  final List<FakePermissionFeed> feeds = <FakePermissionFeed>[];

  /// What [lookup] answers, by request. Absent means the future never completes.
  final Map<String, Future<PermissionLookup> Function()> lookups =
      <String, Future<PermissionLookup> Function()>{};

  /// How many times each request was looked up.
  final Map<String, int> lookedUp = <String, int>{};

  /// The feed most recently opened.
  FakePermissionFeed get feed => feeds.last;

  @override
  PermissionFeed watch(String sessionId) {
    final FakePermissionFeed feed = FakePermissionFeed(sessionId);
    feeds.add(feed);
    return feed;
  }

  @override
  Future<PermissionLookup> lookup(String sessionId, String requestId) {
    lookedUp[requestId] = (lookedUp[requestId] ?? 0) + 1;
    return lookups[requestId]?.call() ?? Completer<PermissionLookup>().future;
  }
}

/// A lock the test decides the answers of.
class FakeApprovalLock implements ApprovalLock {
  FakeApprovalLock({this.available = true, this.verdict = LockVerdict.confirmed});

  bool available;
  LockVerdict verdict;

  /// The reasons the prompt was shown with, one per time it was shown.
  final List<String> asked = <String>[];

  @override
  Future<bool> isAvailable() async => available;

  @override
  Future<LockVerdict> confirm(String reason) async {
    asked.add(reason);
    return verdict;
  }
}

/// The preference, in memory.
class MemoryApprovalPreferences implements ApprovalPreferences {
  MemoryApprovalPreferences({this.required = true});

  bool required;

  @override
  Future<bool> lockRequired() async => required;

  @override
  Future<void> setLockRequired({required bool required}) async => this.required = required;
}

/// The overrides a screen that mounts the permission feature needs, so it never reaches the real
/// socket, HTTP client or lock plugin.
List<Override> permissionOverrides({
  FakePermissionRepository? repository,
  FakeApprovalLock? lock,
  MemoryApprovalPreferences? preferences,
  DateTime Function()? clock,
}) => <Override>[
  permissionRepositoryProvider.overrideWithValue(repository ?? FakePermissionRepository()),
  approvalLockProvider.overrideWithValue(lock ?? FakeApprovalLock()),
  approvalPreferencesProvider.overrideWithValue(preferences ?? MemoryApprovalPreferences()),
  if (clock != null) permissionClockProvider.overrideWithValue(clock),
];

/// The permission frames, read as the app's own words.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/network/contracts/protocol.g.dart';
import 'package:remote_claude/features/permission/data/mappers/permission_mapper.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_event.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_lookup.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_outcome.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';

import '../../../../../support/builders/frames.dart';

Envelope envelope(
  String type, {
  String kind = 'event',
  String? sessionId = 'session-1',
  Map<String, Object?>? payload,
  String id = 'frame-1',
}) => Envelope(
  v: 1,
  id: id,
  kind: kind,
  type: type,
  ts: '2026-09-14T12:00:00.000Z',
  sessionId: sessionId,
  seq: kind == 'event' ? 1 : null,
  payload: payload,
);

Envelope requested(Map<String, Object?> overrides, {String? sessionId = 'session-1'}) => envelope(
  PermissionFrames.requested,
  kind: 'request',
  sessionId: sessionId,
  id: 'req-frame-1',
  payload: permissionRequestedPayload(overrides),
);

PermissionRequest? requestOf(Envelope frame) => switch (permissionEventFrom(frame)) {
  PermissionAsked(:final PermissionRequest request) => request,
  _ => null,
};

Envelope error({String? code, String? messageKey, bool withPayload = true}) => Envelope(
  v: 1,
  id: 'err-1',
  kind: 'error',
  type: 'error',
  ts: '2026-09-14T12:00:00.000Z',
  correlationId: 'cmd-1',
  payload: withPayload
      ? <String, Object?>{'code': ?code, 'messageKey': ?messageKey, 'traceId': 't'}
      : null,
);

void main() {
  group('permission.requested', () {
    test('becomes a question carrying the id of the frame it arrived in', () {
      final PermissionEvent? event = permissionEventFrom(requested(const <String, Object?>{}));

      expect(
        event,
        PermissionAsked(
          frameId: 'req-frame-1',
          request: PermissionRequest(
            requestId: 'req-1',
            sessionId: 'session-1',
            toolUseId: 'tu-1',
            toolName: 'Bash',
            description: 'rm -rf build/',
            input: const <String, Object?>{'command': 'rm -rf build/'},
            riskHint: RiskHint.destructive,
            expiresAt: DateTime.utc(2026, 9, 14, 12, 5),
          ),
        ),
      );
    });

    test('takes the session from the envelope', () {
      expect(
        requestOf(requested(const <String, Object?>{}, sessionId: 'ses-9'))?.sessionId,
        'ses-9',
      );
    });

    test('is dropped when the envelope names no session', () {
      expect(permissionEventFrom(requested(const <String, Object?>{}, sessionId: null)), isNull);
    });

    test('is dropped when the frame has no payload at all', () {
      expect(permissionEventFrom(envelope(PermissionFrames.requested, kind: 'request')), isNull);
    });

    for (final String field in <String>[
      'requestId',
      'toolName',
      'title',
      'expiresAt',
      'riskHint',
    ]) {
      test('is dropped when $field is missing', () {
        expect(permissionEventFrom(requested(<String, Object?>{field: null})), isNull);
      });

      test('is dropped when $field is not text', () {
        expect(permissionEventFrom(requested(<String, Object?>{field: 42})), isNull);
      });
    }

    test('is dropped when expiresAt is not an instant', () {
      expect(permissionEventFrom(requested(const <String, Object?>{'expiresAt': 'soon'})), isNull);
    });

    test('is dropped for a risk this build does not know', () {
      expect(permissionEventFrom(requested(const <String, Object?>{'riskHint': 'mild'})), isNull);
    });

    test('reads each risk this build knows', () {
      expect(
        requestOf(requested(const <String, Object?>{'riskHint': 'read'}))?.riskHint,
        RiskHint.read,
      );
      expect(
        requestOf(requested(const <String, Object?>{'riskHint': 'write'}))?.riskHint,
        RiskHint.write,
      );
      expect(
        requestOf(requested(const <String, Object?>{'riskHint': 'destructive'}))?.riskHint,
        RiskHint.destructive,
      );
    });

    test('reads an absent defaultToNo as true — the safe default is the rule', () {
      expect(
        requestOf(requested(const <String, Object?>{'defaultToNo': null}))?.defaultToNo,
        isTrue,
      );
    });

    test('reads defaultToNo false as false', () {
      expect(
        requestOf(requested(const <String, Object?>{'defaultToNo': false}))?.defaultToNo,
        isFalse,
      );
    });

    test('reads a defaultToNo that is not a boolean as true', () {
      expect(
        requestOf(requested(const <String, Object?>{'defaultToNo': 'no'}))?.defaultToNo,
        isTrue,
      );
    });

    test('reads an input that is not a map as empty', () {
      expect(
        requestOf(requested(const <String, Object?>{'input': 'rm -rf /'}))?.input,
        const <String, Object?>{},
      );
    });

    test('reads an absent toolUseId as empty and an absent description as none', () {
      final PermissionRequest? request = requestOf(
        requested(const <String, Object?>{'toolUseId': null, 'description': null}),
      );

      expect(request?.toolUseId, '');
      expect(request?.description, isNull);
    });

    test('offers only once when there are no suggestions', () {
      expect(requestOf(requested(const <String, Object?>{}))?.scopes, <PermissionScope>[
        PermissionScope.once,
      ]);
    });

    test('offers once and then session when the session scope is suggested', () {
      final PermissionRequest? request = requestOf(
        requested(const <String, Object?>{
          'suggestions': <Object?>[
            <String, Object?>{'scope': 'session'},
            <String, Object?>{'scope': 'session'},
          ],
        }),
      );

      expect(request?.scopes, <PermissionScope>[PermissionScope.once, PermissionScope.session]);
    });

    // S-67 — "don't ask again" with no rule to describe is the button R-02 is about.
    test('ignores a persisted scope with no rule, and entries that are not suggestions', () {
      final PermissionRequest? request = requestOf(
        requested(const <String, Object?>{
          'suggestions': <Object?>[
            <String, Object?>{'scope': 'always'},
            <String, Object?>{'scope': 'project'},
            'session',
            null,
          ],
        }),
      );

      expect(request?.scopes, <PermissionScope>[PermissionScope.once]);
    });

    test('ignores suggestions that are not a list', () {
      final PermissionRequest? request = requestOf(
        requested(const <String, Object?>{
          'suggestions': <String, Object?>{'scope': 'session'},
        }),
      );

      expect(request?.scopes, <PermissionScope>[PermissionScope.once]);
    });

    // D-12 — the reach and the lifetime come from the server, never from this phone.
    test('offers the persisted scopes with the rule they would grant, narrowest first', () {
      final PermissionRequest? request = requestOf(
        requested(const <String, Object?>{
          'suggestions': <Object?>[
            <String, Object?>{
              'scope': 'always',
              'labelKey': 'permission.scope.always',
              'pattern': 'Bash(git status)',
              'lifetimeMs': 7776000000,
            },
            <String, Object?>{'scope': 'once'},
            <String, Object?>{
              'scope': 'project',
              'labelKey': 'permission.scope.project',
              'pattern': 'Bash(git status)',
              'lifetimeMs': 7776000000,
            },
            <String, Object?>{'scope': 'session'},
          ],
        }),
      );

      expect(request?.scopes, <PermissionScope>[
        PermissionScope.once,
        PermissionScope.session,
        PermissionScope.project,
        PermissionScope.always,
      ]);
      expect(
        request?.rule,
        const RuleOffer(pattern: 'Bash(git status)', lifetime: Duration(days: 90)),
      );
    });

    for (final (String name, Map<String, Object?> rule) in <(String, Map<String, Object?>)>[
      ('no pattern', <String, Object?>{'lifetimeMs': 1000}),
      ('no lifetime', <String, Object?>{'pattern': 'Bash(x)'}),
      (
        'a lifetime that is not a whole number',
        <String, Object?>{'pattern': 'Bash(x)', 'lifetimeMs': 1.5},
      ),
      ('a lifetime of zero', <String, Object?>{'pattern': 'Bash(x)', 'lifetimeMs': 0}),
    ]) {
      test('does not offer a persisted scope with $name — S-67', () {
        final PermissionRequest? request = requestOf(
          requested(<String, Object?>{
            'suggestions': <Object?>[
              <String, Object?>{'scope': 'always', ...rule},
            ],
          }),
        );

        expect(request?.scopes, <PermissionScope>[PermissionScope.once]);
        expect(request?.rule, isNull);
      });
    }
  });

  group('permission.resolved', () {
    Envelope resolved(Map<String, Object?> payload) =>
        envelope(PermissionFrames.resolved, payload: payload);

    test('reads an allow answered on the web', () {
      expect(
        permissionEventFrom(
          resolved(const <String, Object?>{
            'requestId': 'req-1',
            'decision': 'allow',
            'auto': false,
            'resolvedFrom': 'web',
          }),
        ),
        const PermissionSettled(
          PermissionOutcome(
            requestId: 'req-1',
            decision: PermissionDecision.allow,
            auto: false,
            origin: AnswerOrigin.web,
          ),
        ),
      );
    });

    test('reads a deny answered on a phone', () {
      expect(
        permissionEventFrom(
          resolved(const <String, Object?>{
            'requestId': 'req-1',
            'decision': 'deny',
            'resolvedFrom': 'mobile',
          }),
        ),
        const PermissionSettled(
          PermissionOutcome(
            requestId: 'req-1',
            decision: PermissionDecision.deny,
            auto: false,
            origin: AnswerOrigin.mobile,
          ),
        ),
      );
    });

    // S-81, from the server's side: a refusal nobody made is the deadline's.
    test('reads an automatic refusal with no author as the deadline refusing it', () {
      expect(
        permissionEventFrom(
          resolved(const <String, Object?>{'requestId': 'req-1', 'decision': 'deny', 'auto': true}),
        ),
        const PermissionSettled(PermissionOutcome.expired('req-1')),
      );
    });

    test('reads an automatic refusal with an author as a rule, not the deadline', () {
      final PermissionEvent? event = permissionEventFrom(
        resolved(const <String, Object?>{
          'requestId': 'req-1',
          'decision': 'deny',
          'auto': true,
          'resolvedBy': 'user-1',
        }),
      );

      final PermissionOutcome outcome = (event! as PermissionSettled).outcome;
      expect(outcome.expired, isFalse);
      expect(outcome.auto, isTrue);
    });

    test('an automatic yes is never the deadline, which only ever refuses', () {
      final PermissionEvent? event = permissionEventFrom(
        resolved(const <String, Object?>{'requestId': 'req-1', 'decision': 'allow', 'auto': true}),
      );

      expect((event! as PermissionSettled).outcome.expired, isFalse);
    });

    test('reads an origin this build does not know as unknown', () {
      final PermissionEvent? event = permissionEventFrom(
        resolved(const <String, Object?>{
          'requestId': 'req-1',
          'decision': 'allow',
          'resolvedFrom': 'cli',
        }),
      );

      expect((event! as PermissionSettled).outcome.origin, AnswerOrigin.unknown);
    });

    test('is dropped for a decision that is neither allow nor deny', () {
      expect(
        permissionEventFrom(
          resolved(const <String, Object?>{'requestId': 'req-1', 'decision': 'maybe'}),
        ),
        isNull,
      );
    });

    test('is dropped without a request id', () {
      expect(permissionEventFrom(resolved(const <String, Object?>{'decision': 'allow'})), isNull);
    });
  });

  group('permission.extended', () {
    Envelope extended(Map<String, Object?> payload) =>
        envelope(PermissionFrames.extended, payload: payload);

    test('moves the deadline', () {
      expect(
        permissionEventFrom(
          extended(const <String, Object?>{
            'requestId': 'req-1',
            'expiresAt': '2026-09-14T12:10:00.000Z',
            'remainingExtensions': 2,
          }),
        ),
        PermissionDeadlineMoved(
          requestId: 'req-1',
          expiresAt: DateTime.utc(2026, 9, 14, 12, 10),
          remainingExtensions: 2,
        ),
      );
    });

    test('is dropped without a request id', () {
      expect(
        permissionEventFrom(
          extended(const <String, Object?>{
            'expiresAt': '2026-09-14T12:10:00.000Z',
            'remainingExtensions': 2,
          }),
        ),
        isNull,
      );
    });

    test('is dropped without a deadline', () {
      expect(
        permissionEventFrom(
          extended(const <String, Object?>{'requestId': 'req-1', 'remainingExtensions': 2}),
        ),
        isNull,
      );
    });

    test('is dropped when remainingExtensions is not an integer', () {
      expect(
        permissionEventFrom(
          extended(const <String, Object?>{
            'requestId': 'req-1',
            'expiresAt': '2026-09-14T12:10:00.000Z',
            'remainingExtensions': '2',
          }),
        ),
        isNull,
      );
    });
  });

  test('a frame that is not about permissions is nobody here', () {
    expect(
      permissionEventFrom(
        envelope('message.delta', payload: const <String, Object?>{'requestId': 'req-1'}),
      ),
      isNull,
    );
  });

  group('extensionRefusalFrom', () {
    test('reads the ceiling from its message key', () {
      expect(
        extensionRefusalFrom(
          error(code: 'INVALID_STATE', messageKey: 'permission.error.extensionLimitReached'),
        ),
        ExtensionRefusal.ceiling,
      );
    });

    // S-66: extending a request that is already over is refused, and the card waits for the
    // settlement instead of showing an error.
    test('S-66 reads a request nobody knows any more as over', () {
      expect(
        extensionRefusalFrom(error(code: 'PERMISSION_REQUEST_NOT_FOUND', messageKey: 'k')),
        ExtensionRefusal.over,
      );
    });

    test('S-66 reads an expired request as over', () {
      expect(
        extensionRefusalFrom(error(code: 'PERMISSION_REQUEST_EXPIRED', messageKey: 'k')),
        ExtensionRefusal.over,
      );
    });

    test('is nothing for an error about something else', () {
      expect(extensionRefusalFrom(error(code: 'INVALID_INPUT', messageKey: 'k')), isNull);
    });

    test('is nothing for an error without a payload', () {
      expect(extensionRefusalFrom(error(withPayload: false)), isNull);
    });
  });

  group('permissionLookupFrom', () {
    test('reads a pending request with the extensions left', () {
      expect(
        permissionLookupFrom(<String, Object?>{
          'status': 'pending',
          'request': permissionRequestedPayload(),
          'remainingExtensions': 1,
        }, sessionId: 'session-1'),
        LookupPending(
          PermissionRequest(
            requestId: 'req-1',
            sessionId: 'session-1',
            toolUseId: 'tu-1',
            toolName: 'Bash',
            description: 'rm -rf build/',
            input: const <String, Object?>{'command': 'rm -rf build/'},
            riskHint: RiskHint.destructive,
            expiresAt: DateTime.utc(2026, 9, 14, 12, 5),
          ),
          remainingExtensions: 1,
        ),
      );
    });

    test('reads a pending request without the extensions left as unknown', () {
      final PermissionLookup? lookup = permissionLookupFrom(<String, Object?>{
        'status': 'pending',
        'request': permissionRequestedPayload(),
        'remainingExtensions': 'one',
      }, sessionId: 'session-1');

      expect(lookup, isA<LookupPending>());
      expect((lookup! as LookupPending).remainingExtensions, isNull);
    });

    test('takes the session from the caller', () {
      final PermissionLookup? lookup = permissionLookupFrom(<String, Object?>{
        'status': 'pending',
        'request': permissionRequestedPayload(),
      }, sessionId: 'ses-9');

      expect((lookup! as LookupPending).request.sessionId, 'ses-9');
    });

    test('is nothing for a pending body whose request cannot be read', () {
      expect(
        permissionLookupFrom(<String, Object?>{
          'status': 'pending',
          'request': permissionRequestedPayload(const <String, Object?>{'title': null}),
        }, sessionId: 'session-1'),
        isNull,
      );
    });

    test('is nothing for a pending body whose request is not a map', () {
      expect(
        permissionLookupFrom(const <String, Object?>{
          'status': 'pending',
          'request': 'req-1',
        }, sessionId: 'session-1'),
        isNull,
      );
    });

    test('reads a resolved request', () {
      expect(
        permissionLookupFrom(const <String, Object?>{
          'status': 'resolved',
          'requestId': 'req-1',
          'decision': 'allow',
          'auto': false,
          'resolvedFrom': 'web',
        }, sessionId: 'session-1'),
        const LookupSettled(
          PermissionOutcome(
            requestId: 'req-1',
            decision: PermissionDecision.allow,
            auto: false,
            origin: AnswerOrigin.web,
          ),
        ),
      );
    });

    test('is nothing for a resolved body without a decision', () {
      expect(
        permissionLookupFrom(const <String, Object?>{
          'status': 'resolved',
          'requestId': 'req-1',
        }, sessionId: 'session-1'),
        isNull,
      );
    });

    test('is nothing for a status this build does not know', () {
      expect(
        permissionLookupFrom(const <String, Object?>{
          'status': 'archived',
          'requestId': 'req-1',
        }, sessionId: 'session-1'),
        isNull,
      );
    });

    test('is nothing for a body that is not a map', () {
      expect(permissionLookupFrom(<Object?>['pending'], sessionId: 'session-1'), isNull);
      expect(permissionLookupFrom(null, sessionId: 'session-1'), isNull);
    });
  });
}

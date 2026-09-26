import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_outcome.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';

import '../../../../../support/builders/permissions.dart';

void main() {
  group('the deadline', () {
    final PermissionRequest request = aPermissionRequest(expiresAt: t0);

    test('is not over a millisecond before it', () {
      expect(request.isExpiredAt(t0.subtract(const Duration(milliseconds: 1))), isFalse);
    });

    // Silence refuses at the deadline itself, not a tick after it.
    test('is over at the instant itself', () {
      expect(request.isExpiredAt(t0), isTrue);
    });

    test('counts what is left, and never below zero', () {
      expect(
        request.remainingAt(t0.subtract(const Duration(seconds: 3))),
        const Duration(seconds: 3),
      );
      expect(request.remainingAt(t0.add(const Duration(seconds: 3))), Duration.zero);
    });

    test('moves, and nothing else about the question does', () {
      final PermissionRequest moved = request.withDeadline(t0.add(const Duration(minutes: 1)));

      expect(moved.expiresAt, t0.add(const Duration(minutes: 1)));
      expect(moved.withDeadline(t0), request);
    });
  });

  group('the second step', () {
    test('is asked of a destructive yes', () {
      expect(aPermissionRequest().needsConfirmation(PermissionScope.once), isTrue);
    });

    test('is not asked of an ephemeral yes to anything else', () {
      for (final RiskHint risk in <RiskHint>[RiskHint.write, RiskHint.read]) {
        final PermissionRequest request = aPermissionRequest(riskHint: risk);
        expect(request.needsConfirmation(PermissionScope.once), isFalse);
        expect(request.needsConfirmation(PermissionScope.session), isFalse);
      }
    });

    // S-65, D-14 — the second step is where the reach of "don't ask again" is said in full.
    test('is asked of every yes that persists a rule, whatever the risk', () {
      final PermissionRequest reading = aPermissionRequest(riskHint: RiskHint.read);

      expect(reading.needsConfirmation(PermissionScope.project), isTrue);
      expect(reading.needsConfirmation(PermissionScope.always), isTrue);
    });

    test('knows which scopes persist', () {
      expect(
        PermissionScope.values.where((PermissionScope scope) => scope.isPersisted),
        <PermissionScope>[PermissionScope.project, PermissionScope.always],
      );
    });

    test('keeps the rule it would grant when the deadline moves', () {
      const RuleOffer rule = RuleOffer(pattern: 'Bash(git status)', lifetime: Duration(days: 90));
      final PermissionRequest offering = aPermissionRequest(rule: rule);

      expect(offering.withDeadline(t0).rule, rule);
      expect(offering, isNot(aPermissionRequest()));
    });
  });

  group('the command on screen', () {
    test('is the detail the backend named, exactly', () {
      expect(aPermissionRequest().command, 'rm -rf build/');
    });

    // With no detail, the whole input — never a summary of it.
    test('is the whole input when there is no detail', () {
      final PermissionRequest request = aPermissionRequest(
        description: null,
        input: <String, Object?>{'file_path': '/tmp/a', 'content': 'x'},
      );

      expect(request.command, contains('"file_path": "/tmp/a"'));
      expect(request.command, contains('"content": "x"'));
    });
  });

  test('two requests with the same fields are the same request', () {
    expect(aPermissionRequest(), aPermissionRequest());
    expect(aPermissionRequest(), isNot(aPermissionRequest(requestId: 'other')));
  });

  group('an outcome', () {
    test('of the deadline is a refusal nobody made', () {
      const PermissionOutcome outcome = PermissionOutcome.expired('request-1');

      expect(outcome.decision, PermissionDecision.deny);
      expect(outcome.auto, isTrue);
      expect(outcome.expired, isTrue);
      expect(outcome.origin, AnswerOrigin.unknown);
    });

    // Built at run time on purpose: two identical `const` expressions are one instance, and the
    // comparison would answer by identity without the value equality ever running.
    PermissionOutcome allowedBy(String requestId) =>
        PermissionOutcome(requestId: requestId, decision: PermissionDecision.allow, auto: false);

    test('compares by value', () {
      expect(allowedBy('r'), allowedBy('r'));
      expect(allowedBy('r'), isNot(allowedBy('other')));
    });
  });
}

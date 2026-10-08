/// One answer, as it leaves for the server (plan 23, B-16).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/domain/repositories/permission_repository.dart';

OutgoingAnswer answer({String frameId = 'frame-1', RuleReachKind? reach}) => OutgoingAnswer(
  frameId: frameId,
  requestId: 'req-1',
  decision: PermissionDecision.allow,
  scope: PermissionScope.session,
  reach: reach,
);

void main() {
  test('two answers with the same fields are the same answer', () {
    expect(answer(reach: RuleReachKind.prefix), answer(reach: RuleReachKind.prefix));
  });

  test('the reach and the frame tell two answers apart', () {
    expect(answer(reach: RuleReachKind.prefix), isNot(answer(reach: RuleReachKind.exact)));
    expect(answer(frameId: 'frame-2'), isNot(answer()));
  });

  test('a yes carries no reason unless one is given', () {
    expect(answer().reason, isNull);
    expect(answer().reach, isNull);
  });
}

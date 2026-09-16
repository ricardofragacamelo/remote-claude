import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/auth/data/mappers/id_token_claims.dart';

String jwt(Map<String, Object?> claims) {
  String segment(Map<String, Object?> value) =>
      base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');

  return '${segment(<String, Object?>{'alg': 'RS256'})}.${segment(claims)}.signature';
}

void main() {
  test('reads the subject of a well-formed token', () {
    expect(subjectOf(jwt(<String, Object?>{'sub': 'user-1'})), 'user-1');
  });

  test('answers null when there is no token at all', () {
    expect(subjectOf(null), isNull);
  });

  test('answers null when the token is not a JWT', () {
    expect(subjectOf('not.a'), isNull);
    expect(subjectOf('one-part'), isNull);
  });

  test('answers null when the payload is not readable', () {
    expect(subjectOf('a.!!!!.c'), isNull);
  });

  test('answers null when the token carries no subject', () {
    expect(subjectOf(jwt(<String, Object?>{'email': 'someone@example.com'})), isNull);
  });

  test('answers null when the subject is not a string', () {
    expect(subjectOf(jwt(<String, Object?>{'sub': 42})), isNull);
  });

  test('answers the whole payload when asked for it', () {
    expect(claimsOf(jwt(<String, Object?>{'sub': 'user-1', 'exp': 1})), <String, Object?>{
      'sub': 'user-1',
      'exp': 1,
    });
  });

  test('a payload that is not an object is not claims', () {
    final String odd =
        '${base64Url.encode(utf8.encode('{}')).replaceAll('=', '')}'
        '.${base64Url.encode(utf8.encode('[1]')).replaceAll('=', '')}.sig';

    expect(subjectOf(odd), isNull);
  });
}

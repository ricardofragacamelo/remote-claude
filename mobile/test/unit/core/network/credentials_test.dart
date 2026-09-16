import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/network/credentials.dart';

void main() {
  test('starts with nobody signed in', () {
    final Credentials credentials = Credentials();

    expect(credentials.accessToken, isNull);
    expect(credentials.locale, 'en');
  });

  test('holds what the auth feature pushes in', () {
    final Credentials credentials = Credentials()
      ..setAccessToken('token')
      ..setLocale('pt-BR');

    expect(credentials.accessToken, 'token');
    expect(credentials.locale, 'pt-BR');
  });

  test('renewing without a renewer answers null rather than throwing', () async {
    expect(await Credentials().renew(), isNull);
  });

  test('deduplicates renewal — N callers, one exchange', () async {
    int calls = 0;
    final Completer<String?> gate = Completer<String?>();

    final Credentials credentials = Credentials()
      ..setRenewer(() {
        calls += 1;
        return gate.future;
      });

    final Future<String?> first = credentials.renew();
    final Future<String?> second = credentials.renew();
    final Future<String?> third = credentials.renew();

    gate.complete('fresh');

    expect(await Future.wait(<Future<String?>>[first, second, third]), <String?>[
      'fresh',
      'fresh',
      'fresh',
    ]);
    expect(calls, 1);
  });

  test('a later renewal is a new exchange', () async {
    int calls = 0;
    final Credentials credentials = Credentials()
      ..setRenewer(() async {
        calls += 1;
        return 'fresh';
      });

    await credentials.renew();
    await credentials.renew();

    expect(calls, 2);
  });

  test('clearing the renewer stops renewal', () async {
    final Credentials credentials = Credentials()
      ..setRenewer(() async => 'fresh')
      ..setRenewer(null);

    expect(await credentials.renew(), isNull);
  });
}

/// One origin, checked, normalised, and the three addresses it gives (plan 10, B-28).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/config/connection_origin.dart';

void main() {
  test('S-93 · the API, the socket and the issuer of an origin', () {
    expect(
      ConnectionEndpoints.of('https://x.example', '/realms/rc'),
      const ConnectionEndpoints(
        api: 'https://x.example/api',
        socket: 'wss://x.example/ws',
        issuer: 'https://x.example/realms/rc',
      ),
    );
    expect(
      ConnectionEndpoints.of('http://localhost:5173', '/realms/rc').socket,
      'ws://localhost:5173/ws',
    );
  });

  test('S-94 · the same origin however it is written', () {
    for (final String written in <String>[
      'https://x.example',
      'https://x.example/',
      ' https://x.example ',
      'https://X.Example',
      'HTTPS://x.example:443',
    ]) {
      expect(checkOrigin(written), const ValidOrigin('https://x.example'), reason: written);
    }

    expect(checkOrigin('https://x.example:8443/'), const ValidOrigin('https://x.example:8443'));
    expect(checkOrigin('http://localhost:80'), const ValidOrigin('http://localhost'));
    expect(checkOrigin('https://[::1]:8443'), const ValidOrigin('https://[::1]:8443'));
    expect(checkOrigin('https://[FE80::1]'), const ValidOrigin('https://[fe80::1]'));
  });

  test('S-95 · in a release, http only to this phone itself', () {
    for (final String clear in <String>[
      'http://192.168.0.10',
      'http://10.0.0.5:3000',
      'http://server.local',
    ]) {
      expect(
        checkOrigin(clear, privateNetwork: false),
        const InvalidOrigin(OriginProblem.plainText),
        reason: clear,
      );
    }

    expect(
      checkOrigin('http://localhost:5173', privateNetwork: false),
      const ValidOrigin('http://localhost:5173'),
    );
    expect(
      checkOrigin('http://127.0.0.1:5173', privateNetwork: false),
      const ValidOrigin('http://127.0.0.1:5173'),
    );
  });

  group('the private network, in a debug build (D-20)', () {
    test('S-121 · http to an address of the private network is an origin, normalised', () {
      expect(
        checkOrigin('http://192.168.0.10:5173'),
        const ValidOrigin('http://192.168.0.10:5173'),
      );
      expect(checkOrigin('HTTP://10.0.0.5/'), const ValidOrigin('http://10.0.0.5'));
      expect(checkOrigin('http://172.20.1.2:80'), const ValidOrigin('http://172.20.1.2'));
    });

    test('S-122 · the edges of each range', () {
      for (final String inside in <String>[
        '10.0.0.0',
        '10.255.255.255',
        '172.16.0.0',
        '172.31.255.255',
        '192.168.0.0',
        '192.168.255.255',
      ]) {
        expect(checkOrigin('http://$inside'), ValidOrigin('http://$inside'), reason: inside);
      }

      for (final String outside in <String>[
        '9.255.255.255',
        '11.0.0.0',
        '172.15.255.255',
        '172.32.0.0',
        '192.167.255.255',
        '192.169.0.0',
      ]) {
        expect(
          checkOrigin('http://$outside'),
          const InvalidOrigin(OriginProblem.plainText),
          reason: outside,
        );
      }
    });

    test('S-123 · a public address, a name, a malformed address or IPv6 stay refused', () {
      for (final String clear in <String>[
        'http://203.0.113.10',
        'http://server.local',
        'http://10.0.0.256',
        'http://10.0.0',
        'http://10.0.0.1.5',
        'http://10.0.0.0x1',
        'http://[fd00::1]',
      ]) {
        expect(checkOrigin(clear), const InvalidOrigin(OriginProblem.plainText), reason: clear);
      }
    });

    test('S-124 · the default follows the build: a test is not the product, so it is on', () {
      expect(plainTextOnPrivateNetwork, isTrue);
      expect(
        checkOrigin('http://192.168.0.10', privateNetwork: false),
        const InvalidOrigin(OriginProblem.plainText),
      );
    });
  });

  test('S-96 · what is not an origin, each with its reason', () {
    final Map<String, OriginProblem> wrong = <String, OriginProblem>{
      '': OriginProblem.empty,
      '   ': OriginProblem.empty,
      'x.example': OriginProblem.notAnAddress,
      'https://': OriginProblem.notAnAddress,
      '::::': OriginProblem.notAnAddress,
      'ftp://x.example': OriginProblem.scheme,
      'https://x.example/app': OriginProblem.path,
      'https://x.example?a=1': OriginProblem.query,
      'https://x.example#top': OriginProblem.fragment,
      'https://me:secret@x.example': OriginProblem.userInfo,
    };

    wrong.forEach((String written, OriginProblem problem) {
      expect(checkOrigin(written), InvalidOrigin(problem), reason: written);
    });
  });
}

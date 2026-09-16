import { describe, expect, it } from 'vitest';

import { parseViolations } from '../../../scripts/lib/import-lint.mjs';

describe('parseViolations', () => {
  it('reads the file, the refused import and the rule from one line', () => {
    const output = [
      'Analyzing...',
      '   warning • /repo/mobile/lib/features/session/domain/a.dart:1:8 • package:dio/dio.dart • domain_is_pure_http',
      '',
      '1 issues found.',
    ].join('\n');

    expect(parseViolations(output)).toEqual([
      {
        location: '/repo/mobile/lib/features/session/domain/a.dart:1:8',
        offender: 'package:dio/dio.dart',
        rule: 'domain_is_pure_http',
      },
    ]);
  });

  it('reads an error the same way it reads a warning', () => {
    const output = '   error • /repo/a.dart:2:1 • package:flutter/material.dart • domain_is_pure';

    expect(parseViolations(output)).toHaveLength(1);
  });

  it('answers nothing for a clean run', () => {
    expect(parseViolations('Analyzing...\nNo issues found! 🎉\n')).toEqual([]);
  });

  it('is not fooled by prose that happens to contain a bullet', () => {
    expect(parseViolations('note • something • else')).toEqual([]);
  });
});

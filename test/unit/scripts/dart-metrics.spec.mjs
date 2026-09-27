import { describe, expect, it } from 'vitest';

import {
  VIOLATION_EXIT_CODE,
  complexityVerdict,
  parseComplexity,
} from '../../../scripts/lib/dart-metrics.mjs';

/** The spinner the tool draws while it works: cursor codes and carriage returns, on one line. */
const SPINNER =
  '\u001b[2K\r⠙ Analyzing...\u001b[2K\r⠹ Processing 1/4 contexts with 190 file(s)... 1.0s' +
  '\u001b[2K\r✔ Analysis is completed. Preparing the results: 21.6s';

/** What a run that found two functions over the bar prints, as captured from the real tool. */
const TWO_OVER = [
  SPINNER,
  '',
  'lib/features/session/presentation/providers/rewind_controller.dart:',
  'WARNING RewindBoard._copy',
  '        cyclomatic complexity: 14',
  '',
  '',
  'lib/features/permission/presentation/providers/permission_queue_controller.dart:',
  'ALARM   PermissionQueueController.answer',
  '        cyclomatic complexity: 21',
  '',
].join('\n');

describe('parseComplexity', () => {
  // S-65
  it('reads the file, the function and the value of each violation', () => {
    expect(parseComplexity(TWO_OVER)).toEqual([
      {
        file: 'lib/features/session/presentation/providers/rewind_controller.dart',
        member: 'RewindBoard._copy',
        value: 14,
      },
      {
        file: 'lib/features/permission/presentation/providers/permission_queue_controller.dart',
        member: 'PermissionQueueController.answer',
        value: 21,
      },
    ]);
  });

  it('reads two functions of the same file under the one file header', () => {
    const output = [
      'lib/a.dart:',
      'WARNING first',
      '        cyclomatic complexity: 11',
      'WARNING second',
      '        cyclomatic complexity: 12',
    ].join('\n');

    expect(parseComplexity(output).map((violation) => violation.member)).toEqual([
      'first',
      'second',
    ]);
  });

  it('answers nothing for a clean run', () => {
    expect(parseComplexity(`${SPINNER}\n\n✔ no issues found!\n`)).toEqual([]);
  });

  it('ignores a value with no function named before it', () => {
    expect(parseComplexity('lib/a.dart:\n        cyclomatic complexity: 30\n')).toEqual([]);
  });

  it('reads a report written with Windows line endings', () => {
    const output = 'lib/a.dart:\r\nWARNING f\r\n        cyclomatic complexity: 11\r\n';

    expect(parseComplexity(output)).toEqual([{ file: 'lib/a.dart', member: 'f', value: 11 }]);
  });
});

describe('complexityVerdict', () => {
  it('is clean only when the tool exited 0 and finished the analysis', () => {
    expect(complexityVerdict(0, `${SPINNER}\n`)).toEqual({ kind: 'clean' });
  });

  it('names the violations when the tool exits with its violation code', () => {
    const verdict = complexityVerdict(VIOLATION_EXIT_CODE, TWO_OVER);

    expect(verdict.kind).toBe('violations');
    expect(verdict.kind === 'violations' && verdict.violations).toHaveLength(2);
  });

  // S-66 — each of these would otherwise be read as "nothing found".
  it('is broken when the tool exits 0 without finishing the analysis', () => {
    expect(complexityVerdict(0, 'Resolving dependencies...\n')).toEqual({
      kind: 'broken',
      reason: 'exited 0 without finishing the analysis',
    });
  });

  it('is broken when the violation code comes without a function named', () => {
    expect(complexityVerdict(VIOLATION_EXIT_CODE, SPINNER)).toEqual({
      kind: 'broken',
      reason: 'exited 2 without naming a function',
    });
  });

  it('is broken on any other exit code, even with a report printed', () => {
    expect(complexityVerdict(255, TWO_OVER)).toEqual({ kind: 'broken', reason: 'exited 255' });
    expect(complexityVerdict(3, SPINNER)).toEqual({ kind: 'broken', reason: 'exited 3' });
  });
});

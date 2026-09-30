import fs from 'node:fs';

import { environment } from './environment';

/**
 * Every SDK message variant this build failed to recognise during a live run.
 *
 * `unmapped sdk message variant — dropped` is what the runner logs when the SDK sends something this
 * build has never seen. The survival rule means the session carried on regardless — which is right,
 * and is also exactly why a warning nobody reads is how a contract break reaches production quietly.
 * The live suite reads it here, from the backend's own log of the run.
 */
export function unknownVariants(): string[] {
  const log = fs.readFileSync(environment.backendLog, 'utf8');

  return log
    .split('\n')
    .filter((line) => line.includes('unmapped sdk message variant'))
    .map((line) => {
      const parsed = JSON.parse(line) as { variant?: string };
      return parsed.variant ?? 'unknown';
    });
}

/** One line of the backend's log, as it was written. */
export type LogLine = Readonly<Record<string, unknown>>;

/** Every line the backend wrote under one trace, in order — both halves of an HTTP edge included. */
export function linesOfTrace(traceId: string): LogLine[] {
  return fs
    .readFileSync(environment.backendLog, 'utf8')
    .split('\n')
    .filter((line) => line.includes(traceId))
    .map((line) => JSON.parse(line) as LogLine)
    .filter((line) => line['traceId'] === traceId);
}

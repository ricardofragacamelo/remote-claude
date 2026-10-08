#!/usr/bin/env node
/**
 * What following conversations costs on this machine — plan 22, B-19, D-11.
 *
 *   pnpm transcript:follow-bench
 *
 * Reads the store of whoever runs it, through the Agent SDK and nothing else: the largest transcript
 * and the four largest followed at once. Prints times and heap, never a word of a conversation. It
 * writes nothing and spends no quota. Exits 0 once it measured; 1 with nothing to measure, or when the
 * SDK failed.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { measureFollow, reportLines } from './lib/follow-bench.mjs';
import { repoRoot } from './lib/paths.mjs';
import { fail, line, ok, title } from './lib/ui.mjs';

title('transcript follow — what a tick costs');

// The SDK is the backend's dependency: resolved from there, never added to the root.
const fromBackend = createRequire(path.join(repoRoot, 'backend', 'package.json'));
const sdk = await import(pathToFileURL(fromBackend.resolve('@anthropic-ai/claude-agent-sdk')).href);

try {
  const report = await measureFollow(sdk, {
    now: () => performance.now(),
    heap: () => process.memoryUsage().heapUsed,
  });

  if (report === null) {
    fail('nothing to measure', 'the store of this machine has no conversation with a size');
    process.exitCode = 1;
  } else {
    for (const text of reportLines(report)) {
      line(text);
    }
    ok('measured', 'record the numbers in D-11 of plan 22 when they move it');
  }
} catch (error) {
  fail('the Agent SDK failed', String(error));
  process.exitCode = 1;
}

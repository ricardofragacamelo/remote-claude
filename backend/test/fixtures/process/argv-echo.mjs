#!/usr/bin/env node
/**
 * A stub subprocess for `NodeChildProcessRunner`'s integration tests.
 *
 * It echoes its own argv and env as one line of JSON — the only way a test can prove, from
 * outside the adapter, that `$(touch x)` arrived as an inert string rather than a shell command,
 * and that no `RC_*` or credential reached the child. Everything after that first line is
 * controlled by its own env, so one script covers the sentinel, the sleeping and the byte-dump
 * scenarios without three near-identical files.
 */
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

process.stdout.write(`${JSON.stringify({ argv: process.argv.slice(2), env: process.env })}\n`);

if (process.env['STUB_IGNORE_SIGTERM'] === '1') {
  process.on('SIGTERM', () => {});
}

if (process.env['STUB_DUMP_BYTES'] !== undefined) {
  process.stdout.write(`${'x'.repeat(Number(process.env['STUB_DUMP_BYTES']))}\n`);
}

if (process.env['STUB_SLEEP_MS'] !== undefined) {
  await sleep(Number(process.env['STUB_SLEEP_MS']));
}

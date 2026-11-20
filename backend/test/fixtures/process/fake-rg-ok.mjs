#!/usr/bin/env node
/**
 * A stub ripgrep for `resolveRipgrepBinary`'s integration tests.
 *
 * Prints a modern-enough `--version` line — unless `RIPGREP_CONFIG_PATH` reached it, in which
 * case it prints a version nothing accepts, so a leak turns into a loud failure rather than a
 * silent pass (S-22).
 */
import process from 'node:process';

process.stdout.write(
  process.env['RIPGREP_CONFIG_PATH'] !== undefined
    ? 'ripgrep 0.0.1 (RIPGREP_CONFIG_PATH leaked)\n'
    : 'ripgrep 15.0.0 (rev deadbeef)\n\nfeatures:+pcre2\n',
);

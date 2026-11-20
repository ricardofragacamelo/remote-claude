#!/usr/bin/env node
/** A stub that is not ripgrep at all — the "wrong binary at this path" scenario. */
import process from 'node:process';

process.stdout.write('command not found\n');

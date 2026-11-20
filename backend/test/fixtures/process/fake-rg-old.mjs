#!/usr/bin/env node
/** A stub ripgrep reporting a version below any realistic minimum — S-20. */
import process from 'node:process';

process.stdout.write('ripgrep 1.0.0 (rev deadbeef)\n');

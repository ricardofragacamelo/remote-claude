#!/usr/bin/env node
/**
 * Gates 1-7: the short cycle, for while the work is being done.
 *
 * Usage: `pnpm verify`
 */

import process from 'node:process';

import { verify } from './lib/verify.mjs';

process.exitCode = verify(false);

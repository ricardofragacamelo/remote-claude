#!/usr/bin/env node
/**
 * Gates 1-11: what "done" means.
 *
 * A checklist that needs eleven commands remembered is a checklist done halfway, which is why
 * this exists as one command. See docs/architecture/shared/10-definition-of-done.md.
 *
 * Usage: `pnpm verify:full`
 */

import process from 'node:process';

import { verify } from './lib/verify.mjs';

process.exitCode = verify(true);

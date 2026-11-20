import { execFile } from 'node:child_process';

/** The one place `child_process` is allowed. */
export const run = execFile;

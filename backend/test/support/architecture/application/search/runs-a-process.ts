import { execFile } from 'node:child_process';

/** `child_process` imported outside its adapter — forbidden by `child-process-is-isolated`. */
export const run = execFile;

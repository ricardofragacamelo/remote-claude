import process from 'node:process';

/** Whether this run only checks what is generated, instead of writing it. */
export function hasCheckFlag() {
  return process.argv.includes('--check');
}

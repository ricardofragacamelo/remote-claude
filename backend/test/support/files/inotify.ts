import { readdirSync, readFileSync } from 'node:fs';

/**
 * The inotify watches this process holds right now — one `inotify wd:` line of
 * `/proc/self/fdinfo/<fd>` per watch, the count the kernel charges against
 * `max_user_watches` (plan 07, D-08). Linux only, like inotify.
 */
export function inotifyWatches(): number {
  let total = 0;

  for (const fd of readdirSync('/proc/self/fdinfo')) {
    try {
      total += readFileSync(`/proc/self/fdinfo/${fd}`, 'utf8')
        .split('\n')
        .filter((line) => line.startsWith('inotify wd:')).length;
    } catch {
      // The descriptor of the listing itself is closed by the time it is read; it holds no watch.
    }
  }

  return total;
}

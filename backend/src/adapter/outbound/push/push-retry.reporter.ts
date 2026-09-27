import type { PushRetryReporter } from '@application/notification';
import type { Logger } from '@shared/logging/logger';

/**
 * What the push retries have to say, said in the log.
 *
 * One `warn` when a message is given up on, carrying how many attempts were made and why it
 * stopped — never one per attempt, which is how a flaky minute of the provider becomes a page of
 * warnings nobody reads (S-48).
 */
export function loggingRetryReporter(logger: Logger): PushRetryReporter {
  const base = { op: 'push.send', layer: 'adapter', module: 'notification' };

  return {
    exhausted: (exhaustion) => {
      logger.warn({ ...base, ...exhaustion }, 'push given up after its attempts');
    },
    failed: (error, requestId) => {
      logger.warn({ ...base, requestId, err: error }, 'a push retry failed');
    },
  };
}

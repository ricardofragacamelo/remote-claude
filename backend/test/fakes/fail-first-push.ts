import type { PushOutcome, PushSender } from '@application/notification';
import type { PushMessage } from '@domain/notification';

/**
 * The real provider, behind one failure: the first announcement of a question it is handed fails
 * as a network failure would, and everything after goes through untouched.
 *
 * It exists for the real-push run (plan 05, S-53): the provider cannot be told to fail on demand,
 * and a retry that is never exercised against the real thing is a retry nobody has seen work.
 * Withdrawals are never failed — the scenario is about the question reaching the phone.
 */
export class FailFirstPushSender implements PushSender {
  private failed = false;

  constructor(private readonly real: PushSender) {}

  send(message: PushMessage): Promise<PushOutcome> {
    if (!this.failed && message.kind === 'permissionRequested') {
      this.failed = true;
      return Promise.resolve({ delivery: 'failed', retryAfterMs: null });
    }

    return this.real.send(message);
  }
}

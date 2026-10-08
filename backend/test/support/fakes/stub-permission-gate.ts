import type {
  PermissionQuestion,
  PermissionVerdict,
  SessionPermissionGate,
} from '@application/session';
import type { PermissionMode, SessionId } from '@domain/session';

/**
 * The gate, answering whatever the test tells it to.
 *
 * It records the questions rather than only counting them, because the interesting assertions are
 * about **which** tools reached it: the whole asymmetry the product rests on is that the hook fires
 * for every tool and this only for some.
 */
export class StubPermissionGate implements SessionPermissionGate {
  readonly asked: PermissionQuestion[] = [];
  readonly forgotten: string[] = [];
  readonly modes: { readonly sessionId: string; readonly mode: PermissionMode }[] = [];

  constructor(
    private verdict: PermissionVerdict = { decision: 'allow', reason: null, answers: null },
  ) {}

  /** Changes the answer for every question from here on. */
  answer(verdict: PermissionVerdict): void {
    this.verdict = verdict;
  }

  ask(question: PermissionQuestion): Promise<PermissionVerdict> {
    this.asked.push(question);
    return Promise.resolve(this.verdict);
  }

  forget(sessionId: SessionId): void {
    this.forgotten.push(sessionId.value);
  }

  modeChanged(sessionId: SessionId, mode: PermissionMode): Promise<void> {
    this.modes.push({ sessionId: sessionId.value, mode });
    return Promise.resolve();
  }

  /** The tools it was consulted about, in order. */
  get tools(): string[] {
    return this.asked.map((question) => question.toolName);
  }
}

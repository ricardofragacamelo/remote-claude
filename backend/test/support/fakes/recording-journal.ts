import type { JournalScope, SessionFileJournal } from '@application/session';
import type { SessionId } from '@domain/session';

/** The file journal, writing into arrays. It never throws, exactly as the real one never does. */
export class RecordingJournal implements SessionFileJournal {
  readonly turns: { sessionId: string; promptId: string; promptText: string }[] = [];
  readonly captured: {
    sessionId: string;
    claudeSessionId: string;
    promptId: string;
    path: string;
  }[] = [];
  readonly results: { sessionId: string; claudeSessionId: string; path: string }[] = [];

  openTurn(sessionId: SessionId, promptId: string, promptText: string): Promise<void> {
    this.turns.push({ sessionId: sessionId.value, promptId, promptText });
    return Promise.resolve();
  }

  captureBefore(scope: JournalScope, promptId: string, path: string): Promise<void> {
    this.captured.push({
      sessionId: scope.sessionId.value,
      claudeSessionId: scope.claudeSessionId.value,
      promptId,
      path,
    });
    return Promise.resolve();
  }

  recordResult(scope: JournalScope, path: string): Promise<void> {
    this.results.push({
      sessionId: scope.sessionId.value,
      claudeSessionId: scope.claudeSessionId.value,
      path,
    });
    return Promise.resolve();
  }
}

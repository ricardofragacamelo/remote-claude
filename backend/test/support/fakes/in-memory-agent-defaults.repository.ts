import type { AgentDefaultsRepository, StoredDefaults } from '@application/agent-settings';
import type { AgentDefaults, FolderDefaults } from '@domain/agent-settings';
import type { UserId } from '@domain/auth';

/** The defaults of everybody, of every engine, in memory. */
export class InMemoryAgentDefaults implements AgentDefaultsRepository {
  readonly rows = new Map<string, AgentDefaults>();
  saves = 0;

  read(userId: UserId, engine: string): Promise<StoredDefaults> {
    const mine = [...this.rows].filter(([key]) => key.startsWith(`${userId.value} ${engine} `));
    const user = mine.find(([key]) => key.endsWith(' -'))?.[1] ?? null;
    const overrides: FolderDefaults[] = mine
      .filter(([key]) => !key.endsWith(' -'))
      .map(([key, values]) => ({ folder: key.split(' ').slice(2).join(' '), values }));
    return Promise.resolve({ user, overrides });
  }

  save(
    userId: UserId,
    engine: string,
    folder: string | null,
    values: AgentDefaults,
  ): Promise<void> {
    this.saves += 1;
    this.rows.set(`${userId.value} ${engine} ${folder ?? '-'}`, values);
    return Promise.resolve();
  }

  remove(userId: UserId, engine: string, folder: string): Promise<boolean> {
    return Promise.resolve(this.rows.delete(`${userId.value} ${engine} ${folder}`));
  }
}

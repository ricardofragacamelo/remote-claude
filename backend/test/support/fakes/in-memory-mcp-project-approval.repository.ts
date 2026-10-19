import type { UserId } from '@domain/auth';
import type {
  McpProjectApprovalRepository,
  McpProjectApprovalWrite,
  StoredMcpProjectApproval,
} from '@application/mcp';

function key(userId: UserId, engine: string, folderPath: string, name: string): string {
  return `${userId.value}\u0000${engine}\u0000${folderPath}\u0000${name}`;
}

/** Every decision kept in memory — what a unit test holds instead of the real table. */
export class InMemoryMcpProjectApprovalRepository implements McpProjectApprovalRepository {
  private readonly rows = new Map<string, StoredMcpProjectApproval>();

  async listFor(userId: UserId, engine: string): Promise<readonly StoredMcpProjectApproval[]> {
    return [...this.rows.values()].filter(
      (row) => row.userId.value === userId.value && row.engine === engine,
    );
  }

  async findOne(
    userId: UserId,
    engine: string,
    folderPath: string,
    name: string,
  ): Promise<StoredMcpProjectApproval | null> {
    return this.rows.get(key(userId, engine, folderPath, name)) ?? null;
  }

  async upsert(write: McpProjectApprovalWrite, now: Date): Promise<StoredMcpProjectApproval> {
    const stored: StoredMcpProjectApproval = { ...write, decidedAt: now };
    this.rows.set(key(write.userId, write.engine, write.folderPath, write.name), stored);
    return stored;
  }
}

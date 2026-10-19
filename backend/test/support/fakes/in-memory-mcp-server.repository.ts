import type { UserId } from '@domain/auth';
import {
  DuplicateMcpServerNameError,
  type McpServerRepository,
  type McpServerWrite,
  type RevealedMcpServer,
  type StoredMcpServer,
} from '@application/mcp';

/** A server kept whole, secret values included — what only a test may hold in memory, in clear. */
type Row = RevealedMcpServer;

function rowOf(
  id: string,
  write: McpServerWrite,
  now: Date,
  createdAt: Date,
  enabled: boolean,
): Row {
  const { config } = write;
  return {
    id,
    userId: write.userId,
    engine: write.engine,
    name: config.name,
    scope: config.scope,
    folderPath: config.folderPath,
    transport: config.transport,
    command: config.command,
    args: config.args,
    envNames: config.env.map((entry) => entry.name),
    url: config.url,
    headerNames: config.headers.map((header) => header.name),
    enabled,
    createdAt,
    updatedAt: now,
    env: config.env,
    headers: config.headers,
  };
}

function stored(row: Row): StoredMcpServer {
  return {
    id: row.id,
    userId: row.userId,
    engine: row.engine,
    name: row.name,
    scope: row.scope,
    folderPath: row.folderPath,
    transport: row.transport,
    command: row.command,
    args: row.args,
    envNames: row.envNames,
    url: row.url,
    headerNames: row.headerNames,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function sameScope(
  a: Row,
  b: { userId: UserId; engine: string; name: string; scope: string; folderPath: string | null },
): boolean {
  return (
    a.userId.equals(b.userId) &&
    a.engine === b.engine &&
    a.name === b.name &&
    a.scope === b.scope &&
    a.folderPath === b.folderPath
  );
}

/** An in-memory `McpServerRepository`, for use-case tests — secrets held in clear, on purpose. */
export class InMemoryMcpServerRepository implements McpServerRepository {
  private readonly rows = new Map<string, Row>();

  listFor(userId: UserId, engine: string): Promise<readonly StoredMcpServer[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((row) => row.userId.equals(userId) && row.engine === engine)
        .map(stored),
    );
  }

  findById(id: string): Promise<StoredMcpServer | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row === undefined ? null : stored(row));
  }

  reveal(id: string): Promise<RevealedMcpServer | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  insert(id: string, write: McpServerWrite, now: Date): Promise<StoredMcpServer> {
    const candidate = {
      userId: write.userId,
      engine: write.engine,
      name: write.config.name,
      scope: write.config.scope,
      folderPath: write.config.folderPath,
    };
    for (const row of this.rows.values()) {
      if (sameScope(row, candidate)) {
        return Promise.reject(new DuplicateMcpServerNameError(write.config.name));
      }
    }
    const row = rowOf(id, write, now, now, true);
    this.rows.set(id, row);
    return Promise.resolve(stored(row));
  }

  update(id: string, write: McpServerWrite, now: Date): Promise<StoredMcpServer> {
    const existing = this.rows.get(id);
    if (existing === undefined) {
      return Promise.reject(new Error(`no row ${id} to update`));
    }
    const candidate = {
      userId: write.userId,
      engine: write.engine,
      name: write.config.name,
      scope: write.config.scope,
      folderPath: write.config.folderPath,
    };
    for (const row of this.rows.values()) {
      if (row.id !== id && sameScope(row, candidate)) {
        return Promise.reject(new DuplicateMcpServerNameError(write.config.name));
      }
    }
    const row = rowOf(id, write, now, existing.createdAt, existing.enabled);
    this.rows.set(id, row);
    return Promise.resolve(stored(row));
  }

  setEnabled(id: string, enabled: boolean, now: Date): Promise<StoredMcpServer> {
    const existing = this.rows.get(id);
    if (existing === undefined) {
      return Promise.reject(new Error(`no row ${id} to toggle`));
    }
    const row = { ...existing, enabled, updatedAt: now };
    this.rows.set(id, row);
    return Promise.resolve(stored(row));
  }

  delete(id: string): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }
}

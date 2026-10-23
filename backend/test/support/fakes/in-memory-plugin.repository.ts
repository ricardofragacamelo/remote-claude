import type { UserId } from '@domain/auth';
import type { PluginRepository, PluginWrite, StoredPlugin } from '@application/engines/claude';

function rowOf(
  id: string,
  write: PluginWrite,
  now: Date,
  createdAt: Date,
  enabled: boolean,
): StoredPlugin {
  return {
    id,
    userId: write.userId,
    origin: write.identity.origin,
    path: write.identity.path,
    marketplace: write.identity.marketplace,
    commit: write.identity.commit,
    name: write.name,
    approvedDigest: write.approvedDigest,
    enabled,
    createdAt,
    updatedAt: now,
  };
}

/** An in-memory `PluginRepository`, for use-case tests (plan 13, B-27). */
export class InMemoryPluginRepository implements PluginRepository {
  private readonly rows = new Map<string, StoredPlugin>();

  listFor(userId: UserId): Promise<readonly StoredPlugin[]> {
    return Promise.resolve([...this.rows.values()].filter((row) => row.userId.equals(userId)));
  }

  findById(id: string): Promise<StoredPlugin | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  findByPath(userId: UserId, path: string): Promise<StoredPlugin | null> {
    const found = [...this.rows.values()].find(
      (row) => row.userId.equals(userId) && row.path === path,
    );
    return Promise.resolve(found ?? null);
  }

  insert(id: string, write: PluginWrite, now: Date): Promise<StoredPlugin> {
    const row = rowOf(id, write, now, now, true);
    this.rows.set(id, row);
    return Promise.resolve(row);
  }

  async insertIfAbsent(
    id: string,
    write: PluginWrite,
    now: Date,
  ): Promise<{ plugin: StoredPlugin; created: boolean }> {
    const existing = await this.findByPath(write.userId, write.identity.path);
    if (existing !== null) {
      return { plugin: existing, created: false };
    }
    return { plugin: await this.insert(id, write, now), created: true };
  }

  updateInstalled(
    id: string,
    fields: { readonly commit: string; readonly approvedDigest: string },
    now: Date,
  ): Promise<StoredPlugin> {
    const existing = this.rows.get(id);
    if (existing === undefined) {
      return Promise.reject(new Error(`no row ${id} to update`));
    }
    const row = {
      ...existing,
      commit: fields.commit,
      approvedDigest: fields.approvedDigest,
      updatedAt: now,
    };
    this.rows.set(id, row);
    return Promise.resolve(row);
  }

  setEnabled(id: string, enabled: boolean, now: Date): Promise<StoredPlugin> {
    const existing = this.rows.get(id);
    if (existing === undefined) {
      return Promise.reject(new Error(`no row ${id} to toggle`));
    }
    const row = { ...existing, enabled, updatedAt: now };
    this.rows.set(id, row);
    return Promise.resolve(row);
  }

  delete(id: string): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }
}

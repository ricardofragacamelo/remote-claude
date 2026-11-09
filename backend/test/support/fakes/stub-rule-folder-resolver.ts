import type { UserId } from '@domain/auth';
import { WorkspacePath } from '@domain/workspace';
import type { RuleFolderResolver } from '@application/permission';

/**
 * A `RuleFolderResolver` a test can read and steer, without a real allowlist or disk.
 *
 * By default it normalises [raw] the way `WorkspacePath` does and hands it back — enough for a
 * spec that is not about the allowlist. `refuseWith` makes the next calls fail with whatever a
 * real resolver would have thrown, so a spec can prove the grant routine stops there.
 */
export class StubRuleFolderResolver implements RuleFolderResolver {
  private fault: Error | null = null;
  readonly calls: { raw: string; userId: UserId }[] = [];

  /** Paths `reaches` refuses — empty by default, meaning every path still reaches. */
  unreachable = new Set<string>();

  async resolve(raw: string, userId: UserId): Promise<WorkspacePath> {
    this.calls.push({ raw, userId });

    if (this.fault !== null) {
      throw this.fault;
    }

    return WorkspacePath.create(raw);
  }

  reaches(path: string): boolean {
    return !this.unreachable.has(path);
  }

  /** Every call from here on refuses with [error], until {@link clear}. */
  refuseWith(error: Error): void {
    this.fault = error;
  }

  clear(): void {
    this.fault = null;
  }
}

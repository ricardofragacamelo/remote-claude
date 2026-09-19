import type { PermissionRequestRepository } from '@application/permission';
import type { PermissionRequest } from '@domain/permission';

/**
 * The history of requests, in a map.
 *
 * It keeps both writes separately — `opened` and `updated` — because the point of writing a
 * request twice is that the first write survives a process that dies before anybody answers. A
 * fake that only kept the latest state could not tell the two apart, and neither could a test.
 */
export class InMemoryPermissionRequestRepository implements PermissionRequestRepository {
  readonly opened: string[] = [];
  readonly updated: string[] = [];

  /** When set, every write rejects with it. */
  failWith: Error | null = null;

  open(request: PermissionRequest): Promise<void> {
    if (this.failWith !== null) {
      return Promise.reject(this.failWith);
    }

    this.opened.push(request.id);
    return Promise.resolve();
  }

  update(request: PermissionRequest): Promise<void> {
    if (this.failWith !== null) {
      return Promise.reject(this.failWith);
    }

    this.updated.push(request.id);
    return Promise.resolve();
  }

  /** The ids that were written a second time, which is what "it changed" means here. */
  get settled(): readonly string[] {
    return this.updated;
  }
}

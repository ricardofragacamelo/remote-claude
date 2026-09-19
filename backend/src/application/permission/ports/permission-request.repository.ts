import type { PermissionRequest } from '@domain/permission';

/**
 * The history of what was asked and how it ended.
 *
 * Two methods and not one, because a request is written **twice at least**: once when it is put
 * to a human, and again whenever it changes — settled, or given more time. Writing only the
 * settled ones would lose every request still open when the process dies, which is exactly the
 * set somebody investigating an incident wants to see.
 *
 * It is a history and not a trail: unlike `audit_entries` it may be updated, because the second
 * write is the same fact reaching its conclusion rather than a record being rewritten. The record
 * of what was *executed* remains the append-only trail, and that one nothing here touches.
 */
export interface PermissionRequestRepository {
  /** Records a request as it was put to a human. */
  open(request: PermissionRequest): Promise<void>;

  /**
   * Records what changed about it.
   *
   * One method for settling and for extending, because the row is the same row and the difference
   * is which of its columns moved. Two methods would be two copies of one `UPDATE`, and the copy
   * that is not used every day is the one that drifts.
   */
  update(request: PermissionRequest): Promise<void>;
}

export const PERMISSION_REQUEST_REPOSITORY = Symbol('PermissionRequestRepository');

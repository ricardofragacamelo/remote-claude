import type { SessionSubscriber } from './ws-client';

/** The part of the socket client an attachment needs. */
export interface Attacher {
  attach(sessionId: string, subscriber: SessionSubscriber): () => void;
}

/** Attachments held by several owners, and let go when the last one goes. */
export interface Attachments {
  /**
   * Holds `sessionId` attached for `key` — a feature's stream of it — while somebody wants it.
   *
   * The first to ask attaches with the subscriber it builds; the others only count. So a screen that
   * comes back to a session its folder tab kept attached sends **nothing** on the wire: no second
   * `session.attach`, and no replay (plan 06, S-181).
   *
   * @param subscriber built only by the first owner. It must not depend on who that owner is: every
   *   owner of one key and session reads the same store
   * @returns the release — idempotent, so a cleanup that runs twice lets go once
   */
  retain(key: string, sessionId: string, subscriber: () => SessionSubscriber): () => void;
}

/**
 * The attachments of one socket client.
 *
 * Why owners and not screens: a folder tab that is not on screen still has its sessions attached — the
 * permission request and the stream keep arriving
 * ([06 · D-11](../../../../docs/plans/06-workbench/decisions.md#d-11--o-que-uma-aba-inativa-mantém-vivo-e-o-teto-de-abas)).
 * The tab holds them, the screen of the session holds them while it is up, and the socket is
 * detached when neither does.
 */
export function createAttachments(client: Attacher): Attachments {
  const held = new Map<string, { count: number; detach: () => void }>();

  return {
    retain(key, sessionId, subscriber) {
      const id = `${key}:${sessionId}`;
      const existing = held.get(id);

      if (existing === undefined) {
        held.set(id, { count: 1, detach: client.attach(sessionId, subscriber()) });
      } else {
        existing.count += 1;
      }

      let released = false;

      return () => {
        const entry = held.get(id);

        if (released || entry === undefined) {
          return;
        }

        released = true;
        entry.count -= 1;

        if (entry.count === 0) {
          held.delete(id);
          entry.detach();
        }
      };
    },
  };
}

import type { PermissionEvents, PermissionResolvedEvent } from '@application/permission';

/**
 * The internal bus, as a list of subscribers.
 *
 * Small on purpose: what a test needs from the bus is that the event was published, in order, and
 * that a consumer which throws does not take the publication with it — the consumer that matters
 * is the one releasing an agent loop.
 */
export class RecordingPermissionEvents implements PermissionEvents {
  readonly published: PermissionResolvedEvent[] = [];
  private readonly subscribers: ((event: PermissionResolvedEvent) => void)[] = [];

  /** Registers a consumer, exactly as the real bus would. */
  subscribe(consumer: (event: PermissionResolvedEvent) => void): void {
    this.subscribers.push(consumer);
  }

  resolved(event: PermissionResolvedEvent): void {
    this.published.push(event);

    for (const consumer of this.subscribers) {
      consumer(event);
    }
  }

  /** The ids of the requests that were settled, in order. */
  get requestIds(): string[] {
    return this.published.map((event) => event.request.id);
  }
}

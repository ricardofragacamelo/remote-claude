import type { CancelScheduled, Scheduler } from '@application/shared';
import type { UserId } from '@domain/auth';
import type { IdGenerator } from '@domain/shared';
import {
  inferWorking,
  TranscriptFollowLimitError,
  TranscriptFollowLiveHereError,
  transcriptTail,
} from '@domain/transcript';
import type {
  ClaudeSessionId,
  FollowLimitScope,
  TranscriptActivity,
  TranscriptEvent,
  TranscriptMessage,
  VisibleTranscriptSession,
} from '@domain/transcript';
import type { TranscriptStore } from './ports/transcript-store.port';
import { readableTranscript } from './readable-transcript';
import type { TranscriptAudience } from './transcript-audience';

/** The numbers the follower lives by — configured (`RC_TRANSCRIPT_FOLLOW_*`, plan 22, D-11). */
export interface FollowSettings {
  /** How often a conversation `activeElsewhere` is looked at. */
  readonly activeMs: number;
  /** How often one at rest is — it may be taken up in the editor at any moment. */
  readonly idleMs: number;
  /** The most conversations one connection follows at once. */
  readonly maxPerConnection: number;
  /** The most conversations followed at once, over every connection. */
  readonly max: number;
}

/** Why a subscription ended without its client asking — the contract's `reason`. */
export type FollowResetReason = 'rewritten' | 'gone';

/** What one `transcript.appended` says. */
export interface FollowUpdate {
  /** The new entries, as events of the history, in the order of the chain. */
  readonly events: readonly TranscriptEvent[];
  /** The last entry of the conversation now, or `null` while it has none. */
  readonly lastMessageId: string | null;
  readonly activity: TranscriptActivity;
  readonly working: boolean;
}

/**
 * Where the updates of one subscription go — one per `followId`, given by the transport.
 *
 * The transport numbers and sends; this decides what. A sink never throws: a client that went is the
 * transport's to notice, and must not stop the others of the same conversation.
 */
export interface FollowSink {
  /** Whether the connection behind it is still there. */
  readonly open: boolean;
  appended(followId: string, conversationId: string, update: FollowUpdate): void;
  /** The subscription ended without its client asking — said once, and nothing follows it. */
  reset(followId: string, conversationId: string, reason: FollowResetReason): void;
  /** The subscription is gone, whichever way it went. */
  end(): void;
}

/** What the follower tells whoever watches it — the edge logs it; nothing here knows a logger. */
export interface FollowObserver {
  /** A tick looked at a conversation: whether it had been written, and how long it is. */
  looked(
    conversationId: string,
    outcome: { readonly read: boolean; readonly entries: number },
  ): void;
  /** A tick failed; the next one tries again. */
  failed(conversationId: string, error: unknown): void;
}

/** What `transcript.follow` asks for. */
export interface FollowRequest {
  readonly connectionId: string;
  readonly userId: UserId;
  readonly conversationId: ClaudeSessionId;
  /** The last entry the client has, or `null` when the conversation it read was empty. */
  readonly afterMessageId: string | null;
  readonly sink: FollowSink;
}

/** The subscription a follow made. Nothing reaches its sink before {@link start}. */
export interface Following {
  readonly followId: string;
  readonly conversationId: string;
  readonly activity: TranscriptActivity;
  /** The ack went out: from now on the subscription delivers, beginning with everything it missed. */
  start(): void;
}

/** One followed conversation, and who follows it. */
interface Followed {
  readonly id: ClaudeSessionId;
  readonly subscribers: Set<Subscriber>;
  /** The entries of the last read, and the version they were read at. */
  entries: readonly TranscriptMessage[] | null;
  version: number | null;
  /** Every refresh of it runs after the one before: two updates of one subscription never cross. */
  work: Promise<void>;
  timer: CancelScheduled | null;
  closed: boolean;
}

/** One `followId`. */
interface Subscriber {
  readonly followId: string;
  readonly connectionId: string;
  readonly userId: UserId;
  readonly sink: FollowSink;
  readonly followed: Followed;
  /** The conversation as this caller is fenced to see it, renewed by every read. */
  session: VisibleTranscriptSession;
  /** The last entry it was sent. */
  after: string | null;
  /** Whether the ack went out, and whether its first update is still owed. */
  started: boolean;
  owesFirst: boolean;
  /** What it was last told, so an update with nothing new goes out only when one of them moved. */
  activity: TranscriptActivity | null;
  working: boolean | null;
}

/**
 * The follower of conversations this backend does not run — plan 22, B-16, D-02.
 *
 * **One look per conversation**, however many follow it: a tick asks `getSessionInfo` — milliseconds —
 * and reads the messages only when the `lastModified` moved, through the cache and the limiter of the
 * store. **The tick adapts**: short while the conversation is `activeElsewhere`, long at rest. Each
 * subscriber is sent the {@link transcriptTail} after the last entry it has, with the `working`
 * {@link inferWorking} says; an entry the chain lost is a reset, and so is a conversation that went.
 *
 * The fence is the reader's (S-60), a conversation a live session of the caller holds is refused
 * (S-58), and the ceilings refuse rather than degrade (S-61, S-62). A subscription goes **whichever way
 * it goes** — unfollow, the socket dropping, a reset — and the last one of a conversation stops its tick.
 */
export class FollowTranscriptUseCase {
  private readonly conversations = new Map<string, Followed>();
  private readonly connections = new Map<string, Map<string, Subscriber>>();

  constructor(
    private readonly store: TranscriptStore,
    private readonly audience: TranscriptAudience,
    private readonly scheduler: Scheduler,
    private readonly ids: IdGenerator,
    private readonly settings: FollowSettings,
    private readonly observer: FollowObserver,
  ) {}

  /** How many conversations are followed now. */
  get followedConversations(): number {
    return this.conversations.size;
  }

  /** How many followers there are, over every conversation. */
  get subscriptions(): number {
    let followers = 0;
    for (const followed of this.conversations.values()) {
      followers += followed.subscribers.size;
    }
    return followers;
  }

  /**
   * Follows a conversation for one connection.
   *
   * @throws {import('@domain/transcript').TranscriptNotFoundError} no such conversation for this caller
   * @throws {TranscriptFollowLiveHereError} a live session of the caller holds it
   * @throws {TranscriptFollowLimitError} past the ceiling of the connection or of the server
   */
  async follow(request: FollowRequest): Promise<Following> {
    this.refuseOverTheCeiling(request);

    const shown = await readableTranscript(
      this.store,
      this.audience,
      request.conversationId,
      request.userId,
    );

    if (shown.activity.activity === 'liveHere') {
      throw new TranscriptFollowLiveHereError(shown.activity.liveSessionId ?? '');
    }

    // Asked again: the fence above was a wait, and others may have taken the last place meanwhile.
    this.refuseOverTheCeiling(request);

    const subscriber = this.subscribe(request, shown);

    return {
      followId: subscriber.followId,
      conversationId: request.conversationId.value,
      activity: shown.activity.activity,
      start: () => {
        this.begin(subscriber);
      },
    };
  }

  /** Stops one subscription of a connection. One it does not know is not an error (S-66). */
  unfollow(connectionId: string, followId: string): boolean {
    return this.dropAll([this.connections.get(connectionId)?.get(followId)]) === 1;
  }

  /**
   * Every subscription of a connection that is gone (S-67).
   *
   * @returns how many it had
   */
  release(connectionId: string): number {
    return this.dropAll([...(this.connections.get(connectionId)?.values() ?? [])]);
  }

  /** Lets go of each subscription given that still exists; how many there were. */
  private dropAll(subscribers: readonly (Subscriber | undefined)[]): number {
    const known = subscribers.filter((each): each is Subscriber => each !== undefined);

    known.forEach((subscriber) => {
      this.drop(subscriber);
    });
    return known.length;
  }

  private refuseOverTheCeiling(request: FollowRequest): void {
    const mine = this.connections.get(request.connectionId)?.size ?? 0;

    if (mine >= this.settings.maxPerConnection) {
      throw this.limit(this.settings.maxPerConnection, 'connection');
    }

    const already = this.conversations.has(request.conversationId.value);
    if (!already && this.conversations.size >= this.settings.max) {
      throw this.limit(this.settings.max, 'server');
    }
  }

  private limit(limit: number, scope: FollowLimitScope): TranscriptFollowLimitError {
    return new TranscriptFollowLimitError(limit, scope);
  }

  private subscribe(request: FollowRequest, shown: VisibleTranscriptSession): Subscriber {
    const followed = this.conversations.get(request.conversationId.value) ?? this.track(request);
    const subscriber: Subscriber = {
      followId: `t_${this.ids.next()}`,
      connectionId: request.connectionId,
      userId: request.userId,
      sink: request.sink,
      followed,
      session: shown,
      after: request.afterMessageId,
      started: false,
      owesFirst: true,
      activity: null,
      working: null,
    };

    const mine = this.connections.get(request.connectionId) ?? new Map<string, Subscriber>();
    mine.set(subscriber.followId, subscriber);
    this.connections.set(request.connectionId, mine);
    followed.subscribers.add(subscriber);

    return subscriber;
  }

  private track(request: FollowRequest): Followed {
    const followed: Followed = {
      id: request.conversationId,
      subscribers: new Set(),
      entries: null,
      version: null,
      work: Promise.resolve(),
      timer: null,
      closed: false,
    };

    this.conversations.set(request.conversationId.value, followed);
    return followed;
  }

  /** The ack went out: the subscriber's first update — everything after its entry — goes next. */
  private begin(subscriber: Subscriber): void {
    if (!subscriber.sink.open) {
      // The socket went before the ack; its release found this one not yet started.
      this.drop(subscriber);
      return;
    }

    subscriber.started = true;
    this.refresh(subscriber.followed);
  }

  /** Looks at a conversation now, after whatever look of it is still under way. */
  private refresh(followed: Followed): void {
    followed.work = followed.work.then(() => this.look(followed));
  }

  /** One look: is it there, was it written, and what does each subscriber not have yet. */
  private async look(followed: Followed): Promise<void> {
    if (followed.closed) {
      return;
    }

    try {
      await this.lookNow(followed);
    } catch (error) {
      this.observer.failed(followed.id.value, error);
    }

    this.scheduleNext(followed);
  }

  private async lookNow(followed: Followed): Promise<void> {
    const session = await this.store.find(followed.id);

    if (session === null) {
      this.resetEvery(followed, 'gone');
      return;
    }

    const read = followed.entries === null || followed.version !== session.lastModified;

    if (read) {
      await this.fence(followed, session);
      followed.entries = await this.store.messages(session);
      followed.version = session.lastModified;
    }

    this.observer.looked(followed.id.value, { read, entries: followed.entries?.length ?? 0 });

    for (const subscriber of followed.subscribers) {
      subscriber.session = { ...subscriber.session, lastModified: session.lastModified };
      this.deliver(subscriber, followed.entries ?? []);
    }
  }

  /**
   * The whole fence again, for each caller following — on every read, which is when it costs nothing
   * extra to ask: a caller who may no longer read the conversation is told it is gone (S-60).
   */
  private async fence(
    followed: Followed,
    session: Parameters<TranscriptStore['messages']>[0],
  ): Promise<void> {
    for (const subscriber of [...followed.subscribers]) {
      const [shown] = await this.audience.shown([session], subscriber.userId);

      if (shown === undefined) {
        this.resetOne(subscriber, 'gone');
      } else {
        subscriber.session = shown;
      }
    }
  }

  /** One subscriber's share of a look: its tail, or its reset. */
  private deliver(subscriber: Subscriber, entries: readonly TranscriptMessage[]): void {
    if (!subscriber.started) {
      return;
    }

    const tail = transcriptTail(entries, subscriber.after);

    if (tail.kind === 'outside') {
      this.resetOne(subscriber, 'rewritten');
      return;
    }

    const activity = this.audience.activityNow(subscriber.session, subscriber.userId).activity
      .activity;
    const working = inferWorking(entries, activity);
    const moved = activity !== subscriber.activity || working !== subscriber.working;

    if (tail.entries.length === 0 && !subscriber.owesFirst && !moved) {
      return;
    }

    const lastMessageId = entries.at(-1)?.id ?? null;
    subscriber.sink.appended(subscriber.followId, subscriber.followed.id.value, {
      events: tail.entries.flatMap((entry) => entry.events),
      lastMessageId,
      activity,
      working,
    });

    subscriber.after = lastMessageId;
    subscriber.owesFirst = false;
    subscriber.activity = activity;
    subscriber.working = working;
  }

  /** The next look: soon while somebody works on it elsewhere, later at rest — none when unfollowed. */
  private scheduleNext(followed: Followed): void {
    followed.timer?.();
    followed.timer = null;

    if (followed.closed) {
      return;
    }

    const active = [...followed.subscribers].some(
      (subscriber) => subscriber.activity === 'activeElsewhere',
    );

    followed.timer = this.scheduler.after(
      active ? this.settings.activeMs : this.settings.idleMs,
      () => {
        followed.timer = null;
        this.refresh(followed);
      },
    );
  }

  private resetEvery(followed: Followed, reason: FollowResetReason): void {
    for (const subscriber of [...followed.subscribers]) {
      this.resetOne(subscriber, reason);
    }
  }

  /** Tells a subscriber its subscription ended, and lets it go. */
  private resetOne(subscriber: Subscriber, reason: FollowResetReason): void {
    if (subscriber.started) {
      subscriber.sink.reset(subscriber.followId, subscriber.followed.id.value, reason);
    }
    this.drop(subscriber);
  }

  /** Lets a subscription go; the last one of a conversation stops its tick. */
  private drop(subscriber: Subscriber): void {
    const mine = this.connections.get(subscriber.connectionId);
    mine?.delete(subscriber.followId);

    if (mine?.size === 0) {
      this.connections.delete(subscriber.connectionId);
    }

    const { followed } = subscriber;
    followed.subscribers.delete(subscriber);
    subscriber.sink.end();

    if (followed.subscribers.size === 0) {
      followed.closed = true;
      followed.timer?.();
      followed.timer = null;
      this.conversations.delete(followed.id.value);
    }
  }
}

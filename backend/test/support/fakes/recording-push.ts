import type {
  PushAudience,
  PushDelivery,
  PushSender,
  PushTokenRegistry,
} from '@application/notification';
import type { PushMessage } from '@domain/notification';
import type { Device } from '@domain/auth';

/** The provider, answering what the test set and keeping every message it was handed. */
export class RecordingPushSender implements PushSender {
  readonly sent: PushMessage[] = [];

  /** What `send` answers. A function so a test can answer differently per device. */
  answer: (message: PushMessage) => PushDelivery = () => 'delivered';

  send(message: PushMessage): Promise<PushDelivery> {
    this.sent.push(message);
    return Promise.resolve(this.answer(message));
  }

  /** The devices that were reached, in order. The assertion most specs actually want. */
  get deviceIds(): string[] {
    return this.sent.map((message) => message.target.deviceId);
  }

  /** The kinds sent, in order — a question and its withdrawal are different facts. */
  get kinds(): string[] {
    return this.sent.map((message) => message.kind);
  }
}

/** Who can be reached, and whether anybody is looking, both fixed by the test. */
export class StubPushAudience implements PushAudience {
  constructor(
    private readonly devices: readonly Device[] = [],
    private readonly watching = false,
  ) {}

  /** How many times the devices were asked for, so a test can see a second lookup. */
  lookups = 0;

  // The parameters are left off rather than named and ignored: a stub that takes an argument it
  // does not read is a stub somebody reads as filtering by it.
  approvedDevices(): Promise<readonly Device[]> {
    this.lookups += 1;
    return Promise.resolve(this.devices);
  }

  isWatching(): boolean {
    return this.watching;
  }
}

/** What was forgotten, so a test can say the token went and the approval did not. */
export class RecordingPushTokens implements PushTokenRegistry {
  readonly forgotten: Device[] = [];

  forget(device: Device): Promise<void> {
    this.forgotten.push(device);
    return Promise.resolve();
  }
}

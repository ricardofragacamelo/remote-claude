import type { UserId } from '../value-objects/user-id.value-object';
import { DeviceLocale } from '../value-objects/device-locale.value-object';
import type { DevicePlatform, DeviceStatus } from '../value-objects/device-status.value-object';
import { DeviceNotRegisteredError } from '../errors/device-not-registered.error';
import { DeviceRevokedError } from '../errors/device-revoked.error';

/**
 * How long a registration nobody approved stays in the list.
 *
 * Seven days, and the reason is not tidiness: a long list of pending devices is how the wrong one
 * gets approved out of fatigue, months later. Registering again is opening the app
 * ([D-11](../../../../docs/plans/02-mobile-approval/decisions.md#d-11--o-pendente-esquecido)).
 */
export const PENDING_DEVICE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** What registering a device says about it. */
export interface DeviceRegistration {
  readonly id: string;
  readonly userId: UserId;
  readonly installId: string;
  readonly name: string;
  readonly platform: DevicePlatform;
  readonly appVersion: string;
  /** Absent is normal: a device with no push token still watches sessions (S-12). */
  readonly pushToken: string | null;
  /** Whatever the app sent. An unknown or absent language becomes `en`, never a failure. */
  readonly locale: string | null;
  readonly at: Date;
}

/** What the app re-sends every time it opens, or when the provider rotates its token. */
export type DeviceRefresh = Omit<DeviceRegistration, 'id' | 'userId' | 'installId'>;

/**
 * The persisted shape, as the mapper on either side of the repository sees it.
 *
 * Derived from the registration rather than written out again: the two differ in the language,
 * which has become a value object, and in the four fields that record the life the registration
 * has lived since. Restating the other seven is how they come to disagree.
 */
export type DeviceSnapshot = Omit<DeviceRegistration, 'locale' | 'at'> & {
  readonly locale: DeviceLocale;
  readonly status: DeviceStatus;
  readonly registeredAt: Date;
  readonly lastSeenAt: Date;
  readonly approvedAt: Date | null;
  readonly revokedAt: Date | null;
};

/**
 * One installation of the app, and whether it may decide anything.
 *
 * The OIDC token proves **who**; this proves **where from**. Both are needed because the decision
 * it authorises runs a command on somebody's machine
 * (docs/architecture/shared/08-authentication.md#device-e-o-canal-mobile).
 *
 * Every transition returns a new instance rather than mutating: the use case writes what it got
 * back, so a rule that refused cannot leave a half-changed object behind for the repository to
 * persist anyway.
 *
 * `revoked` is terminal, and that is what makes two clients racing deterministic (S-10): approve
 * then revoke ends revoked, and revoke then approve is refused — either order ends in the same
 * place, which is the safe one.
 */
export class Device {
  private constructor(private readonly state: DeviceSnapshot) {}

  /** A registration the person has not approved yet. Every device starts here (S-01). */
  static register(registration: DeviceRegistration): Device {
    return new Device({
      id: registration.id,
      userId: registration.userId,
      installId: registration.installId,
      name: registration.name,
      platform: registration.platform,
      appVersion: registration.appVersion,
      pushToken: registration.pushToken,
      locale: DeviceLocale.create(registration.locale),
      status: 'pending',
      registeredAt: registration.at,
      lastSeenAt: registration.at,
      approvedAt: null,
      revokedAt: null,
    });
  }

  /** Rehydrates a device the repository read back. */
  static restore(snapshot: DeviceSnapshot): Device {
    return new Device(snapshot);
  }

  get id(): string {
    return this.state.id;
  }

  get userId(): UserId {
    return this.state.userId;
  }

  get installId(): string {
    return this.state.installId;
  }

  get status(): DeviceStatus {
    return this.state.status;
  }

  get locale(): DeviceLocale {
    return this.state.locale;
  }

  get pushToken(): string | null {
    return this.state.pushToken;
  }

  /** Whether this device may answer a permission request. Only an approved one may. */
  get canDecide(): boolean {
    return this.state.status === 'approved';
  }

  snapshot(): DeviceSnapshot {
    return this.state;
  }

  /**
   * The same installation registering again: the app opened, or the provider rotated the token.
   *
   * It updates what the app can tell us and **never** the status. A revoked device that registers
   * again stays revoked — otherwise reopening the app would undo a revocation — and an approved
   * one does not have to be approved twice (S-02).
   */
  refresh(update: DeviceRefresh): Device {
    return new Device({
      ...this.state,
      name: update.name,
      platform: update.platform,
      appVersion: update.appVersion,
      pushToken: update.pushToken,
      locale: DeviceLocale.create(update.locale),
      lastSeenAt: update.at,
    });
  }

  /**
   * Forgets a push token the provider refused, keeping the device approved.
   *
   * Revoking it instead would charge a fresh approval through the browser every time the operating
   * system rotates a token
   * ([D-13](../../../../docs/plans/02-mobile-approval/decisions.md#d-13--o-token-que-morre-calado)).
   */
  forgetPushToken(): Device {
    return new Device({ ...this.state, pushToken: null });
  }

  /**
   * Lets the device decide.
   *
   * Approving an already approved device changes nothing, which is what makes two browser tabs
   * clicking at once harmless. Approving a revoked one is refused: bringing a phone back is
   * registering it again, deliberately, not clicking the button that was already on screen.
   *
   * @throws {DeviceRevokedError} when the device has been revoked
   */
  approve(at: Date): Device {
    this.refuseIfRevoked();

    return this.state.status === 'approved'
      ? this
      : new Device({ ...this.state, status: 'approved', approvedAt: at });
  }

  /**
   * Takes the device out, for good.
   *
   * Idempotent (S-09): revoking twice is the same fact stated twice, and answering an error there
   * would make a second click on a slow page look like a failure.
   */
  revoke(at: Date): Device {
    return this.state.status === 'revoked'
      ? this
      : new Device({ ...this.state, status: 'revoked', revokedAt: at });
  }

  /**
   * Whether this registration has sat unapproved past the deadline.
   *
   * The boundary is the one the test asks about: on the sixth day it is still approvable, on the
   * eighth it is gone (S-60).
   */
  hasPendingExpired(now: Date, ttlMs: number = PENDING_DEVICE_TTL_MS): boolean {
    if (this.state.status !== 'pending') {
      return false;
    }

    return now.getTime() - this.state.registeredAt.getTime() > ttlMs;
  }

  /**
   * Refuses unless this device may decide.
   *
   * Two errors and not one, because the two say different things to whoever is holding the phone,
   * and only one of them ends with somebody clicking approve (S-04, S-05).
   *
   * @throws {DeviceNotRegisteredError} when the device is still pending
   * @throws {DeviceRevokedError} when the device has been revoked
   */
  ensureCanDecide(): void {
    this.refuseIfRevoked();

    if (this.state.status !== 'approved') {
      throw new DeviceNotRegisteredError(this.state.installId);
    }
  }

  /**
   * The one guard both the transition and the check need.
   *
   * `revoked` is terminal, and saying so in one place is what makes the two agree: a phone that
   * was taken out is not approved again by a click, and it does not decide anything either.
   *
   * @throws {DeviceRevokedError} when the device has been revoked
   */
  private refuseIfRevoked(): void {
    if (this.state.status === 'revoked') {
      throw new DeviceRevokedError(this.state.installId);
    }
  }
}

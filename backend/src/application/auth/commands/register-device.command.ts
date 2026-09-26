import type { DevicePlatform, UserId } from '@domain/auth';

/** What the app says about itself on `POST /devices`. */
export interface RegisterDeviceCommand {
  readonly userId: UserId;
  readonly installId: string;
  readonly name: string;
  readonly platform: DevicePlatform;
  readonly appVersion: string;
  /** Absent is normal: the device still watches sessions, it just does not get a push (S-12). */
  readonly pushToken: string | null;
  /** Whatever the app sent. Unknown or absent becomes `en` rather than a refusal (S-11). */
  readonly locale: string | null;
}

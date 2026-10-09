import { DeviceNotRegisteredError } from '@domain/auth';
import type { UserId } from '@domain/auth';
import type { ResolveDeviceUseCase } from './resolve-device.use-case';

/** What the refusal names when the caller named no installation at all. */
export const NO_INSTALLATION = '-';

/** Who is asking to read the open folder: the person, and the client their token was issued to. */
export interface FolderReader {
  readonly userId: UserId;

  /** The token's `azp` — `null` when it carries none. */
  readonly clientId: string | null;
}

/**
 * Whether a caller may read the open folder at all
 * ([25 · D-12, D-24](../../../../docs/plans/25-mobile-file-browser/decisions.md#f1--normas-e-a-sessão-encoberta)).
 *
 * The web reads it as it always has. Every other token — the app's, one issued to an unknown
 * client, one with no `azp` — needs an **approved** device of that same person: reading the folder
 * is more than watching a session, which a pending device may do. Leaving the `x-install-id` out
 * does not get round it, and neither does a missing `azp`: only the web's client is let through
 * without a device.
 */
export class AuthorizeFolderReadUseCase {
  constructor(
    private readonly devices: ResolveDeviceUseCase,
    private readonly webClientId: string,
  ) {}

  /**
   * @throws {DeviceNotRegisteredError} no installation named, an unknown one, another person's,
   *   or one still pending
   * @throws {import('@domain/auth').DeviceRevokedError} a revoked one
   */
  async execute(reader: FolderReader, installId: string | null): Promise<void> {
    if (reader.clientId === this.webClientId) {
      return;
    }

    if (installId === null) {
      throw new DeviceNotRegisteredError(NO_INSTALLATION);
    }

    await this.devices.ensureCanDecide(reader.userId, installId);
  }
}

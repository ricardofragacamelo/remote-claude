import type {
  EngineModelCatalog,
  EngineModels,
  EngineSessionDefaults,
  EngineSessionOptions,
} from '@application/agent-settings';
import type { UserId } from '@domain/auth';
import type { PermissionMode } from '@domain/engine';
import type { InstallationModel } from '@domain/session';
import type { WorkspacePath } from '@domain/workspace';

/** Every mode the fake installations of these tests run in, unless a test narrows it. */
export const FAKE_PERMISSION_MODES: readonly PermissionMode[] = [
  'ask',
  'acceptEdits',
  'readOnly',
  'allowAll',
];

/**
 * An engine's catalogue of models, answering what a test tells it to — never asking anybody.
 * `knownModels` answers {@link known} directly: a test sets it to `null` for "not probed yet".
 */
export class FakeEngineModelCatalog implements EngineModelCatalog {
  calls = 0;
  failWith: Error | null = null;
  models: readonly InstallationModel[];
  known: readonly InstallationModel[] | null;
  version: string | null;
  readonly permissionModes: readonly PermissionMode[];

  constructor(
    readonly engine: string,
    options: {
      readonly models?: readonly InstallationModel[];
      readonly known?: readonly InstallationModel[] | null;
      readonly version?: string | null;
      readonly permissionModes?: readonly PermissionMode[];
    } = {},
  ) {
    this.models = options.models ?? [];
    this.known = options.known === undefined ? this.models : options.known;
    this.version = options.version ?? '1.0.0';
    this.permissionModes = options.permissionModes ?? FAKE_PERMISSION_MODES;
  }

  modelsOf(): Promise<EngineModels> {
    this.calls += 1;
    if (this.failWith !== null) {
      return Promise.reject(this.failWith);
    }
    return Promise.resolve({ version: this.version, models: this.models });
  }

  knownModels(): readonly InstallationModel[] | null {
    return this.known;
  }
}

/** An engine's extension defaults, answering what a test tells it to for every folder alike. */
export class FakeEngineSessionDefaults implements EngineSessionDefaults {
  calls = 0;
  /** Who was asked, and about which folder — in the order it was asked, for a test to inspect. */
  readonly asked: { readonly userId: UserId; readonly folder: WorkspacePath }[] = [];

  constructor(
    readonly engine: string,
    private options: EngineSessionOptions = { outputStyle: null, stale: [] },
  ) {}

  optionsFor(userId: UserId, folder: WorkspacePath): Promise<EngineSessionOptions> {
    this.calls += 1;
    this.asked.push({ userId, folder });
    return Promise.resolve(this.options);
  }
}

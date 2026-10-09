import { SingleFlight } from '@application/shared';
import type { UserId } from '@domain/auth';
import { accountStateOf, ClaudeConfigForbiddenError } from '@domain/claude-config';
import type { AccountState } from '@domain/claude-config';
import type { Clock } from '@domain/shared';
import type { InstallationAccount, InstallationModel } from '@domain/session';
import { PERMISSION_MODES } from '@domain/session';
import type { ClaudeInstallationCatalog } from './installation-catalog';
import type { FolderAccess } from './ports/folder-access.port';
import type { InstallationFacts, ReadVersion } from './ports/installation.ports';
import type { ModelCheck, ModelCheckOutcome } from './ports/model-check.port';

/** The account of the CLI, as the screen shows it (plan 13, B-11, D-07). */
export interface AccountView extends InstallationAccount {
  readonly state: AccountState;
}

/**
 * `GET /claude/account` — who Claude bills on this machine.
 *
 * Shown to every authenticated user with a root in the allowlist: it is the account their sessions
 * spend, and hiding it protects nothing they could not learn by asking Claude (D-07). Asked in their
 * first root, which is where a probe that needs no particular folder runs.
 */
export class ReadAccountUseCase {
  constructor(
    private readonly folders: FolderAccess,
    private readonly catalog: ClaudeInstallationCatalog,
  ) {}

  /**
   * @throws {ClaudeConfigForbiddenError} the user has no root at all
   * @throws whatever the catalogue threw — `SESSION_LIMIT_REACHED`, `CLAUDE_UNAVAILABLE`, `CLAUDE_TIMEOUT`
   */
  async execute(userId: UserId, refresh: boolean): Promise<AccountView> {
    const root = await this.folders.firstRoot(userId);
    if (root === null) {
      throw new ClaudeConfigForbiddenError('the account of the installation');
    }

    const { account } = (await this.catalog.of(userId, root, refresh)).initialization;
    return { ...account, state: accountStateOf(account) };
  }
}

/** The diagnostic of the installation (plan 13, B-11). */
export interface InstallationView {
  readonly agentSdk: ReadVersion;
  readonly bundledCli: ReadVersion;
  readonly pathCli: ReadVersion & { readonly differs: boolean };
  readonly configDir: InstallationFacts['configDir'];

  /** What the last answer of the installation said of the login — `unknown` before any. */
  readonly login: AccountState | 'unknown';
  readonly lastModelCheck: ModelCheckOutcome | null;
}

/** The test of the connection most recently run, by user — what the diagnostic shows beside it. */
export class ModelChecks {
  private readonly last = new Map<string, ModelCheckOutcome>();
  private readonly running = new SingleFlight<ModelCheckOutcome>();

  constructor(
    private readonly check: ModelCheck,
    private readonly clock: Clock,
  ) {}

  /**
   * One in flight per user: the second asks the first's answer (S-33).
   *
   * @throws whatever the check threw — and then nothing was kept as the last result
   */
  run(userId: UserId, model: string | null): Promise<ModelCheckOutcome> {
    return this.running.run(userId.value, () =>
      this.check.run(model).then((outcome) => {
        const stamped = { ...outcome, at: this.clock.now() };
        this.last.set(userId.value, stamped);
        return stamped;
      }),
    );
  }

  lastOf(userId: UserId): ModelCheckOutcome | null {
    return this.last.get(userId.value) ?? null;
  }
}

/**
 * `GET /claude/installation` — "why does Claude not work here?" Never fails because the CLI did not
 * answer: every part says what it could read and why not (plan 13, B-11). The "Logs and
 * diagnostics" screen of plan 06 and the health screen of plan 18 reuse it.
 */
export class ReadInstallationUseCase {
  constructor(
    private readonly facts: InstallationFacts,
    private readonly catalog: ClaudeInstallationCatalog,
    private readonly checks: ModelChecks,
  ) {}

  async execute(userId: UserId): Promise<InstallationView> {
    const pathCli = await this.facts.pathCli();
    const latest = this.catalog.latest();

    return {
      agentSdk: this.facts.agentSdk,
      bundledCli: this.facts.bundledCli,
      pathCli: {
        ...pathCli,
        differs:
          pathCli.version !== null &&
          this.facts.bundledCli.version !== null &&
          pathCli.version !== this.facts.bundledCli.version,
      },
      configDir: this.facts.configDir,
      login: latest === null ? 'unknown' : accountStateOf(latest.initialization.account),
      lastModelCheck: this.checks.lastOf(userId),
    };
  }
}

/** `POST /claude/diagnostics/model-check` (plan 13, B-12). */
export class CheckModelUseCase {
  constructor(private readonly checks: ModelChecks) {}

  execute(userId: UserId, model: string | null): Promise<ModelCheckOutcome> {
    return this.checks.run(userId, model);
  }
}

/** The models of the installation, and the modes of the product (plan 13, B-13). */
export interface ModelsView {
  readonly cliVersion: string | null;
  readonly models: readonly InstallationModel[];
  readonly permissionModes: readonly string[];
}

/**
 * `GET /claude/models?folder=` — from the installation, never a list in the code: it ages with the
 * first update of the CLI. The modes are the product's own, every one of them, the screen saying
 * which can be a default.
 */
export class ReadModelsUseCase {
  constructor(
    private readonly folders: FolderAccess,
    private readonly catalog: ClaudeInstallationCatalog,
  ) {}

  /**
   * @param rawFolder the folder, or `null` for the user's first root
   * @throws the folder's refusals, `FORBIDDEN` with no root, and the catalogue's
   */
  async execute(userId: UserId, rawFolder: string | null): Promise<ModelsView> {
    const folder =
      rawFolder === null
        ? await this.folders.firstRoot(userId)
        : await this.folders.resolve(rawFolder, userId);
    if (folder === null) {
      throw new ClaudeConfigForbiddenError('the models of the installation');
    }

    const answer = await this.catalog.of(userId, folder);
    return {
      cliVersion: answer.cliVersion,
      models: answer.initialization.models,
      permissionModes: PERMISSION_MODES,
    };
  }
}

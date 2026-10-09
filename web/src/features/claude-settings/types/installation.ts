/** Whether the CLI of the machine is signed in. */
export type AccountState = 'ready' | 'loginRequired';

/** Who Claude bills on this machine — never a token, never the path of a credential (D-07). */
export interface ClaudeAccount {
  readonly state: AccountState;
  readonly email: string | null;
  readonly organization: string | null;
  readonly plan: string | null;
  readonly provider: string | null;
  readonly tokenSource: string | null;
  readonly apiKeySource: string | null;
}

/** A version, or why there is none. */
export interface ReadVersion {
  readonly version: string | null;
  readonly reason: string | null;
}

/** What the test of the connection to the model found. */
export type ModelCheckResult = 'ok' | 'notLoggedIn' | 'rateLimited' | 'failed';

export interface ModelCheckOutcome {
  readonly result: ModelCheckResult;
  readonly model: string | null;
  readonly latencyMs: number;
  readonly costUsd: number | null;
  readonly reason: string | null;
  readonly at: string;
}

/** The diagnostic of the installation — "why does Claude not work here?" */
export interface ClaudeInstallation {
  readonly agentSdk: ReadVersion;
  readonly bundledCli: ReadVersion;
  readonly pathCli: ReadVersion & { readonly differs: boolean };
  readonly configDir: { readonly path: string; readonly fromEnvironment: boolean };
  readonly login: AccountState | 'unknown';
  readonly lastModelCheck: ModelCheckOutcome | null;
}

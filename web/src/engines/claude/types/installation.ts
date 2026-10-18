import type {
  AccountViewPayload,
  InstallationViewPayload,
  ModelCheckOutcomePayload,
  ReadVersion as ContractReadVersion,
} from '@remote-claude/contracts';

/** Whether the CLI of the machine is signed in. */
export type AccountState = AccountViewPayload['state'];

/**
 * Who Claude bills on this machine — never a token, never the path of a credential (D-07,
 * `GET /engines/claude/account`).
 */
export type ClaudeAccount = AccountViewPayload;

/** A version, or why there is none (`GET /engines/claude/installation`). */
export type ReadVersion = ContractReadVersion;

/** What the test of the connection to the model found. */
export type ModelCheckResult = ModelCheckOutcomePayload['result'];

/**
 * `POST /engines/claude/diagnostics/model-check`. `costUsd` is a decimal string, never a float —
 * the money convention this contract already uses for `turn.completed`'s `costUsd` (plan 28, B-48).
 */
export type ModelCheckOutcome = ModelCheckOutcomePayload;

/** The diagnostic of the installation — "why does Claude not work here?" */
export type ClaudeInstallation = InstallationViewPayload;

import type { InstallationAccount, SessionInitialization } from '@domain/session';

/**
 * The account the Claude CLI is signed in to: what every engine's account says, and of the sources
 * of the credential only their **names** — never a token, never the path of a credential (plan 13,
 * D-07).
 */
export interface ClaudeAccount extends InstallationAccount {
  readonly tokenSource: string | null;
  readonly apiKeySource: string | null;
}

/**
 * What the Claude installation says about itself in one question — `initializationResult()` (plan
 * 13, D-05): what every engine says, and the output styles and the account as Claude has them.
 */
export interface ClaudeInitialization extends SessionInitialization {
  readonly outputStyle: string;
  readonly outputStyles: readonly string[];
  readonly account: ClaudeAccount;
}

/** A string field of [value], or `null` — what an answer that did not say it reads as. */
function textOf(value: object, field: string): string | null {
  const read = (value as Readonly<Record<string, unknown>>)[field];
  return typeof read === 'string' ? read : null;
}

/**
 * The initialisation of a Claude session, read off what the core's control hands back: the Claude
 * adapter answers the whole of it, and what it did not say reads as nothing — never as a guess.
 */
export function claudeInitializationOf(init: SessionInitialization): ClaudeInitialization {
  const styles = (init as Partial<ClaudeInitialization>).outputStyles;

  return {
    ...init,
    outputStyle: textOf(init, 'outputStyle') ?? '',
    outputStyles: Array.isArray(styles)
      ? styles.filter((style): style is string => typeof style === 'string')
      : [],
    account: {
      ...init.account,
      tokenSource: textOf(init.account, 'tokenSource'),
      apiKeySource: textOf(init.account, 'apiKeySource'),
    },
  };
}

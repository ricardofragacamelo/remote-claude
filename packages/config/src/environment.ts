import type { ZodType } from 'zod';

/**
 * Raised when the environment cannot be trusted.
 *
 * It carries **every** problem, not the first: a process that reports one missing variable per
 * start turns configuring it into a guessing loop.
 */
export class ConfigurationError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`invalid environment:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    this.name = 'ConfigurationError';
  }
}

/**
 * Validates a source of variables against a schema, or refuses to produce anything.
 *
 * There is no default here, and none anywhere downstream: a value that is missing or malformed
 * stops the process, with a message naming the variable and what was expected.
 *
 * @param schema what the process needs, and in what shape
 * @param source the variables as read from the process — passed in, so a test does not have to
 *   mutate the real environment to exercise a missing one
 * @throws {ConfigurationError} listing every problem
 */
export function parseEnvironment<T>(schema: ZodType<T>, source: unknown): T {
  const parsed = schema.safeParse(source);

  if (parsed.success) {
    return parsed.data;
  }

  throw new ConfigurationError(
    parsed.error.issues.map(
      (issue) => `${issue.path.map(String).join('.')}: ${issue.message.toLowerCase()}`,
    ),
  );
}

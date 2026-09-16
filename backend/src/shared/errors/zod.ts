import type { ZodError } from 'zod';

import { InputValidationError } from './input-validation.error';

/**
 * A Zod failure as the wire-level validation error.
 *
 * Zod, not `class-validator`: with `emitDecoratorMetadata` off there is no reflected type for a
 * DTO class to validate against, and a schema is a value that can be reused by the tests and the
 * generated contract alike. See docs/architecture/shared/09-code-quality.md.
 */
export function toValidationError(error: ZodError): InputValidationError {
  return new InputValidationError(
    error.issues.map((issue) => ({
      field: issue.path.map((segment) => String(segment)).join('.'),
      rule: issue.code,
    })),
  );
}

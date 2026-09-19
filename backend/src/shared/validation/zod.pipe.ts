import { Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

import { toValidationError } from '../errors/zod';

/**
 * Validates what arrived against a schema — a body, a query string, whichever the route binds it to.
 *
 * Format is checked here, at the boundary; the business invariant is checked in the domain. The
 * two are not redundant — one protects the parser, the other protects the rule.
 * See docs/architecture/backend/01-clean-architecture.md.
 */
@Injectable()
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);

    if (!parsed.success) {
      throw toValidationError(parsed.error);
    }

    return parsed.data;
  }
}

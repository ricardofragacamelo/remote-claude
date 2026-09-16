import type { IdGenerator } from '@domain/shared';

/** Valid ULIDs, in a predictable order, so an assertion can name the id it expects. */
export class SequentialIds implements IdGenerator {
  private issued = 0;

  constructor(private readonly prefix = '01J0000000000000000000') {}

  next(): string {
    this.issued += 1;
    return `${this.prefix}${this.issued.toString().padStart(4, '0')}`;
  }

  get count(): number {
    return this.issued;
  }
}

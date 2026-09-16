import { Injectable } from '@nestjs/common';

/** A domain file reaching for the framework — forbidden by `domain-is-pure`. */
@Injectable()
export class NotAllowedInDomain {}

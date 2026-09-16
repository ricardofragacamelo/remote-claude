import { Injectable } from '@nestjs/common';

/** A use case reaching for the framework — forbidden by `application-is-framework-free`. */
@Injectable()
export class NotAllowedInApplication {}

import { Inject, Injectable } from '@nestjs/common';

import type { DefaultEngineName } from '@application/notification';
import { EngineRegistry } from '@application/session';

/**
 * The default engine's own name, from the registry `session` already owns.
 *
 * A thin adapter, for the same reason as `RegistryPushAudience` beside it: the direction of the
 * dependency. `EngineRegistry` is another module's, and a use case reaching for it directly would
 * point the arrow the wrong way.
 */
@Injectable()
export class RegistryDefaultEngineName implements DefaultEngineName {
  constructor(@Inject(EngineRegistry) private readonly engines: EngineRegistry) {}

  async read(): Promise<string> {
    const description = await this.engines.default.describe();
    return description.displayName;
  }
}

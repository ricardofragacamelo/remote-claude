import type { McpServerRepository, RevealedMcpServer } from '@application/mcp';

/**
 * [delegate], except `reveal(racingId)` always answers `null` — a server deleted, or its secret
 * row gone, in the gap between a use case checking ownership and revealing it for real.
 */
export class RevealRacingMcpServerRepository implements McpServerRepository {
  constructor(
    private readonly delegate: McpServerRepository,
    private readonly racingId: string,
  ) {}

  listFor(...args: Parameters<McpServerRepository['listFor']>) {
    return this.delegate.listFor(...args);
  }

  findById(...args: Parameters<McpServerRepository['findById']>) {
    return this.delegate.findById(...args);
  }

  reveal(id: string): Promise<RevealedMcpServer | null> {
    return id === this.racingId ? Promise.resolve(null) : this.delegate.reveal(id);
  }

  insert(...args: Parameters<McpServerRepository['insert']>) {
    return this.delegate.insert(...args);
  }

  update(...args: Parameters<McpServerRepository['update']>) {
    return this.delegate.update(...args);
  }

  setEnabled(...args: Parameters<McpServerRepository['setEnabled']>) {
    return this.delegate.setEnabled(...args);
  }

  delete(...args: Parameters<McpServerRepository['delete']>) {
    return this.delegate.delete(...args);
  }
}

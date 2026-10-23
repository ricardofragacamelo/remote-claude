import type { DeclaredMarketplace, MarketplaceAllowlistSource } from '@application/workspace';

/** A `MarketplaceAllowlistSource` a test fully controls (plan 13, B-47). */
export class FakeMarketplaceAllowlist implements MarketplaceAllowlistSource {
  private marketplaces: readonly DeclaredMarketplace[];

  constructor(initial: readonly DeclaredMarketplace[] = []) {
    this.marketplaces = initial;
  }

  list(): readonly DeclaredMarketplace[] {
    return this.marketplaces;
  }

  find(name: string): DeclaredMarketplace | null {
    return this.marketplaces.find((marketplace) => marketplace.name === name) ?? null;
  }

  /** What a `SIGHUP` reload would do — swaps the declared set a test asserts behaviour around. */
  set(next: readonly DeclaredMarketplace[]): void {
    this.marketplaces = next;
  }
}

/** One declared marketplace, with a git source, for a test that does not care about the URL. */
export function declaredMarketplace(
  name: string,
  url = `https://example.invalid/${name}.git`,
): DeclaredMarketplace {
  return { name, source: { type: 'git', url } };
}

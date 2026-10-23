import { useTranslation } from 'react-i18next';

import { ListStatus } from '@/shared/components/ListStatus';
import { Button } from '@/shared/components/ui/button';
import type { Marketplaces } from '../hooks/useMarketplaces';
import type { MarketplaceCatalog } from '../hooks/useMarketplaceCatalog';
import type { MarketplaceCatalogEntry } from '../types/plugin';

export interface MarketplaceBrowserProps {
  readonly marketplaces: Marketplaces;
  readonly selected: string | null;
  onSelect(name: string | null): void;
  readonly catalog: MarketplaceCatalog;
  readonly search: string;
  onSearchChange(search: string): void;
  onInstall(marketplace: string, entry: MarketplaceCatalogEntry): void;
}

function matches(entry: MarketplaceCatalogEntry, search: string): boolean {
  const query = search.trim().toLowerCase();
  return (
    query === '' ||
    entry.name.toLowerCase().includes(query) ||
    (entry.description ?? '').toLowerCase().includes(query)
  );
}

/**
 * Browsing the marketplaces this installation declares (plan 13, B-47, B-29, S-212): a list of
 * marketplace names, the chosen one's own catalogue with a search, and "Install" on every plugin it
 * lists — never a path typed, never a fetch before a marketplace is chosen. Declaring none at all is
 * explained, not shown as a bare empty list: this screen cannot add one itself, only the allowlist
 * file (B-47) can.
 */
export function MarketplaceBrowser({
  marketplaces,
  selected,
  onSelect,
  catalog,
  search,
  onSearchChange,
  onInstall,
}: MarketplaceBrowserProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <h3 className="text-ui font-ui-strong">{t('engines.claude.marketplace.title')}</h3>

      <ListStatus
        rows={2}
        isLoading={marketplaces.isLoading}
        loadingLabel={t('engines.claude.marketplace.loading')}
        error={marketplaces.error}
        onRetry={marketplaces.retry}
        isEmpty={
          !marketplaces.isLoading && marketplaces.error === null && marketplaces.names.length === 0
        }
        emptyTitle={t('engines.claude.marketplace.emptyTitle')}
        emptyDescription={t('engines.claude.marketplace.emptyBody')}
      />

      {marketplaces.names.length > 0 && (
        <>
          <label className="flex flex-col gap-1 text-ui-sm">
            {t('engines.claude.marketplace.pickLabel')}
            <select
              className="h-10 rounded-lg border border-border bg-transparent px-3 text-ui md:h-8"
              value={selected ?? ''}
              onChange={(event) => {
                onSelect(event.target.value === '' ? null : event.target.value);
              }}
            >
              <option value="">{t('engines.claude.marketplace.pickNone')}</option>
              {marketplaces.names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          {selected !== null && (
            <Catalog
              marketplace={selected}
              catalog={catalog}
              search={search}
              onSearchChange={onSearchChange}
              onInstall={onInstall}
            />
          )}
        </>
      )}
    </section>
  );
}

/** The catalogue's own slice of `MarketplaceBrowserProps` — never redeclared field by field. */
type CatalogProps = Pick<
  MarketplaceBrowserProps,
  'catalog' | 'search' | 'onSearchChange' | 'onInstall'
> & {
  readonly marketplace: string;
};

function Catalog({
  marketplace,
  catalog,
  search,
  onSearchChange,
  onInstall,
}: CatalogProps): React.JSX.Element {
  const { t } = useTranslation();
  const shown = catalog.plugins.filter((entry) => matches(entry, search));

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-ui-sm">
        {t('engines.claude.marketplace.searchLabel')}
        <input
          className="h-10 rounded-lg border border-border bg-transparent px-3 text-ui md:h-8"
          value={search}
          onChange={(event) => {
            onSearchChange(event.target.value);
          }}
        />
      </label>

      <ListStatus
        rows={3}
        isLoading={catalog.isLoading}
        loadingLabel={t('engines.claude.marketplace.catalogLoading')}
        error={catalog.error}
        onRetry={catalog.retry}
        isEmpty={!catalog.isLoading && catalog.error === null && shown.length === 0}
        emptyTitle={t('engines.claude.marketplace.catalogEmptyTitle')}
        emptyDescription={t('engines.claude.marketplace.catalogEmptyBody')}
      />

      {shown.length > 0 && (
        <ul
          className="flex flex-col gap-2"
          aria-label={t('engines.claude.marketplace.catalogListLabel')}
        >
          {shown.map((entry) => (
            <li
              key={entry.name}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2"
            >
              <div className="flex flex-col">
                <span className="font-ui-strong">{entry.name}</span>
                {entry.description !== null && (
                  <span className="text-ui-sm text-muted-foreground">{entry.description}</span>
                )}
                {!entry.supported && (
                  <span className="text-ui-sm text-warning">
                    {t('engines.claude.marketplace.unsupported')}
                  </span>
                )}
              </div>
              <Button
                variant="outline"
                disabled={!entry.supported}
                onClick={() => {
                  onInstall(marketplace, entry);
                }}
              >
                {t('engines.claude.marketplace.install')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

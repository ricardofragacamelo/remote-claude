import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';

const INPUT = 'h-10 rounded-lg border border-border bg-transparent px-3 text-ui md:h-8';

export interface SecretFieldProps {
  readonly nameLabel: string;
  readonly valueLabel: string;
  readonly name: string;
  onNameChange(name: string): void;

  /**
   * `undefined`: the server already has a value for this name, and nothing changes it — the wire
   * shape of B-19's write (S-133). `null`: this write removes it. A string: this write replaces it.
   * Always a string for a row the person just added — there is nothing of it to "leave as is" yet.
   */
  readonly value: string | null | undefined;
  onValueChange(value: string | null | undefined): void;

  /** Whether this name came from the server already — the one case `value` may be `undefined`. */
  readonly existing: boolean;
  onRemove(): void;
}

/**
 * One secret field — an environment variable, a header — write-only (plan 13, B-28, S-133): an
 * existing one shows "set", never the value, with an explicit "change" that reveals an editable,
 * empty input, and a "clear" that removes it on save (undoable before then). A row just added has
 * nothing to hide yet, so it is a plain input from the start.
 */
export function SecretField({
  nameLabel,
  valueLabel,
  name,
  onNameChange,
  value,
  onValueChange,
  existing,
  onRemove,
}: SecretFieldProps): React.JSX.Element {
  const { t } = useTranslation();
  const id = useId();
  const [editing, setEditing] = useState(!existing || value !== undefined);
  const cleared = value === null;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-ui-sm">
        {nameLabel}
        <input
          id={`${id}-name`}
          className={INPUT}
          value={name}
          onChange={(event) => {
            onNameChange(event.target.value);
          }}
        />
      </label>

      <label className="flex flex-col gap-1 text-ui-sm">
        {valueLabel}
        {editing ? (
          <input
            id={`${id}-value`}
            type="password"
            autoComplete="off"
            className={INPUT}
            aria-describedby={`${id}-state`}
            value={value ?? ''}
            onChange={(event) => {
              onValueChange(event.target.value);
            }}
          />
        ) : (
          <span id={`${id}-value`} aria-describedby={`${id}-state`} className={INPUT}>
            {t('agentSettings.mcp.secretSet')}
          </span>
        )}
      </label>

      <p id={`${id}-state`} className="sr-only">
        {cleared
          ? t('agentSettings.mcp.secretWillClear')
          : editing
            ? t('agentSettings.mcp.secretWillSet')
            : t('agentSettings.mcp.secretUnchanged')}
      </p>

      {!editing && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setEditing(true);
            onValueChange('');
          }}
        >
          {t('agentSettings.mcp.secretChange')}
        </Button>
      )}

      {existing && !cleared && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setEditing(false);
            onValueChange(null);
          }}
        >
          {t('agentSettings.mcp.secretClear')}
        </Button>
      )}

      {cleared && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setEditing(false);
            onValueChange(undefined);
          }}
        >
          {t('agentSettings.mcp.secretUndo')}
        </Button>
      )}

      <Button type="button" variant="outline" onClick={onRemove}>
        {t('agentSettings.mcp.secretRemoveRow')}
      </Button>
    </div>
  );
}

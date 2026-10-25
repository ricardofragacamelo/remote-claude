import { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { RefObject } from 'react';

import type { FieldIssue } from '../lib/mcp-validation';
import { TRANSPORT_KEYS } from '../lib/status-words';
import type { McpScope, McpSecretFieldDraft, McpServerFields, McpTransport } from '../types/mcp';
import { SecretField } from './SecretField';

const INPUT = 'h-10 rounded-lg border border-border bg-transparent px-3 text-ui md:h-8';
const TRANSPORTS: readonly McpTransport[] = ['stdio', 'http', 'sse'];

export interface ServerFormProps {
  readonly fields: McpServerFields;
  readonly issues: readonly FieldIssue[];

  /** Names already set on the server being edited — the only rows allowed to start "unchanged". */
  readonly existingSecretNames: ReadonlySet<string>;
  readonly folderChoices: readonly string[];
  onChange(fields: McpServerFields): void;
}

function issueOf(issues: readonly FieldIssue[], field: string): FieldIssue | undefined {
  return issues.find((issue) => issue.field === field);
}

function Issue({ issue }: { readonly issue: FieldIssue | undefined }): React.JSX.Element | null {
  const { t } = useTranslation();
  return issue === undefined ? null : (
    <p role="alert" className="text-ui-sm text-destructive">
      {t(issue.messageKey)}
    </p>
  );
}

/** One labelled text input of the form, with its own inline issue — the name, the command, the URL. */
function TextField({
  label,
  value,
  issue,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly issue: FieldIssue | undefined;
  onChange(value: string): void;
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-ui-sm">
      {label}
      <input
        className={INPUT}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <Issue issue={issue} />
    </label>
  );
}

function secretRows(
  fields: readonly McpSecretFieldDraft[],
  existingSecretNames: ReadonlySet<string>,
  nameLabel: string,
  valueLabel: string,
  onChange: (next: readonly McpSecretFieldDraft[]) => void,
): React.JSX.Element[] {
  return fields.map((field, index) => (
    <SecretField
      key={index}
      nameLabel={nameLabel}
      valueLabel={valueLabel}
      name={field.name}
      existing={existingSecretNames.has(field.name)}
      value={field.value}
      onNameChange={(name) => {
        onChange(fields.map((entry, i) => (i === index ? { ...entry, name } : entry)));
      }}
      onValueChange={(value) => {
        onChange(fields.map((entry, i) => (i === index ? { ...entry, value } : entry)));
      }}
      onRemove={() => {
        onChange(fields.filter((_entry, i) => i !== index));
      }}
    />
  ));
}

/**
 * Moves the keyboard to the row a "+" button just revealed (plan 13, B-45, S-195): without this, the
 * new row is inserted **before** that same button in the DOM, so a keyboard walking forward from it
 * skips straight past the row it just added, to whatever follows the group — found tabbing the whole
 * wizard by keyboard alone, never suspected from a mouse. Never on the form's first mount: a server
 * being edited starts with rows of its own already there, and those keep the dialog's own initial
 * focus (Radix's, on the "Name" field) rather than stealing it.
 */
function useFocusNewRow(container: RefObject<HTMLDivElement | null>, count: number): void {
  const mounted = useRef(false);
  const previous = useRef(count);

  useLayoutEffect(() => {
    if (mounted.current && count > previous.current) {
      const names = container.current?.querySelectorAll<HTMLInputElement>('[data-secret-name]');
      names?.[names.length - 1]?.focus();
    }
    mounted.current = true;
    previous.current = count;
  }, [container, count]);
}

/** The rows of `env` or `headers`, their "add a row" button, and the field's own issue. */
function VariableGroup({
  heading,
  rows,
  existingSecretNames,
  nameLabel,
  valueLabel,
  addLabel,
  issue,
  onChange,
}: {
  readonly heading: string;
  readonly rows: readonly McpSecretFieldDraft[];
  readonly existingSecretNames: ReadonlySet<string>;
  readonly nameLabel: string;
  readonly valueLabel: string;
  readonly addLabel: string;
  readonly issue: FieldIssue | undefined;
  onChange(next: readonly McpSecretFieldDraft[]): void;
}): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  useFocusNewRow(container, rows.length);

  return (
    <div ref={container} className="flex flex-col gap-2">
      <span className="text-ui-sm">{heading}</span>
      {secretRows(rows, existingSecretNames, nameLabel, valueLabel, onChange)}
      <button
        type="button"
        className="self-start text-ui-sm text-primary"
        onClick={() => {
          onChange([...rows, { name: '', value: '' }]);
        }}
      >
        {addLabel}
      </button>
      <Issue issue={issue} />
    </div>
  );
}

/** A fresh draft of the other transport's fields, switching away loses what the old one had. */
function freshFieldsFor(fields: McpServerFields, transport: McpTransport): McpServerFields {
  const shared = { name: fields.name, scope: fields.scope, folderPath: fields.folderPath };
  return transport === 'stdio'
    ? { ...shared, transport, command: '', args: [], env: [] }
    : { ...shared, transport, url: '', headers: [] };
}

/**
 * Step 1 of the wizard: the fields of an MCP server, validated inline as B-18's domain rules would
 * (plan 13, B-28, S-132) — the server's own refusal, shown the same way, wins when the two disagree.
 */
export function ServerForm({
  fields,
  issues,
  existingSecretNames,
  folderChoices,
  onChange,
}: ServerFormProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <TextField
        label={t('agentSettings.mcp.fieldName')}
        value={fields.name}
        issue={issueOf(issues, 'name')}
        onChange={(name) => {
          onChange({ ...fields, name });
        }}
      />

      <label className="flex flex-col gap-1 text-ui-sm">
        {t('agentSettings.mcp.fieldTransport')}
        <select
          className={INPUT}
          value={fields.transport}
          onChange={(event) => {
            onChange(freshFieldsFor(fields, event.target.value as McpTransport));
          }}
        >
          {TRANSPORTS.map((transport) => (
            <option key={transport} value={transport}>
              {t(TRANSPORT_KEYS[transport])}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-ui-sm">
        {t('agentSettings.mcp.fieldScope')}
        <select
          className={INPUT}
          value={fields.scope}
          onChange={(event) => {
            const scope = event.target.value as McpScope;
            onChange({
              ...fields,
              scope,
              folderPath: scope === 'folder' ? fields.folderPath : undefined,
            });
          }}
        >
          <option value="user">{t('agentSettings.mcp.scopeUser')}</option>
          <option value="folder">{t('agentSettings.mcp.scopeFolder')}</option>
        </select>
      </label>

      {fields.scope === 'folder' && (
        <label className="flex flex-col gap-1 text-ui-sm">
          {t('agentSettings.mcp.fieldFolder')}
          <input
            className={INPUT}
            list="agent-settings-mcp-folder-choices"
            value={fields.folderPath ?? ''}
            onChange={(event) => {
              onChange({ ...fields, folderPath: event.target.value });
            }}
          />
          <datalist id="agent-settings-mcp-folder-choices">
            {folderChoices.map((choice) => (
              <option key={choice} value={choice} />
            ))}
          </datalist>
          <Issue issue={issueOf(issues, 'folderPath')} />
        </label>
      )}

      {fields.transport === 'stdio' ? (
        <>
          <TextField
            label={t('agentSettings.mcp.fieldCommand')}
            value={fields.command ?? ''}
            issue={issueOf(issues, 'command')}
            onChange={(command) => {
              onChange({ ...fields, command });
            }}
          />

          <label className="flex flex-col gap-1 text-ui-sm">
            {t('agentSettings.mcp.fieldArgs')}
            <textarea
              className={`${INPUT} h-24`}
              value={(fields.args ?? []).join('\n')}
              onChange={(event) => {
                onChange({
                  ...fields,
                  args: event.target.value.split('\n').filter((line) => line !== ''),
                });
              }}
            />
            <Issue issue={issueOf(issues, 'args')} />
          </label>

          <VariableGroup
            heading={t('agentSettings.mcp.fieldEnv')}
            rows={fields.env ?? []}
            existingSecretNames={existingSecretNames}
            nameLabel={t('agentSettings.mcp.envName')}
            valueLabel={t('agentSettings.mcp.envValue')}
            addLabel={t('agentSettings.mcp.envAddRow')}
            issue={issueOf(issues, 'env')}
            onChange={(env) => {
              onChange({ ...fields, env });
            }}
          />
        </>
      ) : (
        <>
          <TextField
            label={t('agentSettings.mcp.fieldUrl')}
            value={fields.url ?? ''}
            issue={issueOf(issues, 'url')}
            onChange={(url) => {
              onChange({ ...fields, url });
            }}
          />

          <VariableGroup
            heading={t('agentSettings.mcp.fieldHeaders')}
            rows={fields.headers ?? []}
            existingSecretNames={existingSecretNames}
            nameLabel={t('agentSettings.mcp.headerName')}
            valueLabel={t('agentSettings.mcp.headerValue')}
            addLabel={t('agentSettings.mcp.headerAddRow')}
            issue={issueOf(issues, 'headers')}
            onChange={(headers) => {
              onChange({ ...fields, headers });
            }}
          />
        </>
      )}
    </div>
  );
}

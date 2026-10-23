import { useState } from 'react';

import type { AppError } from '@/shared/api/errors';
import { mcpErrorOf } from '../lib/mcp-errors';
import type { FieldIssue } from '../lib/mcp-validation';
import { mcpFieldIssues } from '../lib/mcp-validation';
import { previewMcpServer } from '../services/mcp.service';
import type { McpServerFields, McpServerPreview, McpServerView } from '../types/mcp';
import type { McpServerMutations } from './useMcpServerMutations';

const EMPTY_FIELDS: McpServerFields = {
  name: '',
  scope: 'user',
  transport: 'stdio',
  command: '',
  args: [],
  env: [],
};

function fieldsOf(server: McpServerView): McpServerFields {
  return server.transport === 'stdio'
    ? {
        name: server.name,
        scope: server.scope,
        folderPath: server.folderPath ?? undefined,
        transport: 'stdio',
        command: server.command ?? '',
        args: [...server.args],
        env: server.envNames.map((name) => ({ name })),
      }
    : {
        name: server.name,
        scope: server.scope,
        folderPath: server.folderPath ?? undefined,
        transport: server.transport,
        url: server.url ?? '',
        headers: server.headerNames.map((name) => ({ name })),
      };
}

/** Where the wizard is, and with what — a discriminated union, not a flag matrix. */
export interface WizardState {
  readonly step: 'form' | 'preview';

  /** `null` for adding a server; the server being edited otherwise. */
  readonly editing: McpServerView | null;
  readonly fields: McpServerFields;
  readonly issues: readonly FieldIssue[];
  readonly preview: McpServerPreview | null;
  readonly previewing: boolean;
  readonly previewError: AppError | null;
  readonly saving: boolean;
  readonly saveError: AppError | null;
}

export interface AddServerFlow {
  readonly state: WizardState | null;

  /** Opens the wizard — editing an existing server, or adding one when `editing` is `null`. */
  start(editing: McpServerView | null): void;
  setFields(fields: McpServerFields): void;

  /** Validates locally; clean, it asks the server for the second step's description (S-132). */
  toPreview(): Promise<void>;

  /** Back to the form, keeping the draft (S-132: nothing was written by reaching the preview). */
  back(): void;

  /** The confirm of the second step — only now is anything written (S-132). */
  confirm(): Promise<void>;
  cancel(): void;
}

/**
 * The two-step flow of adding or editing an MCP server (plan 13, B-28, S-132): a form, then a
 * preview of the exact description a save would record — the folder it applies to, and, editing a
 * server whose program changes, the permission rules it would revoke (D-62, D-79). Nothing is
 * written until {@link AddServerFlow.confirm} is called from the second step.
 */
export function useAddServerFlow(engine: string, mutations: McpServerMutations): AddServerFlow {
  const [state, setState] = useState<WizardState | null>(null);

  return {
    state,
    start: (editing) => {
      setState({
        step: 'form',
        editing,
        fields: editing === null ? EMPTY_FIELDS : fieldsOf(editing),
        issues: [],
        preview: null,
        previewing: false,
        previewError: null,
        saving: false,
        saveError: null,
      });
    },
    setFields: (fields) => {
      setState((current) => (current === null ? current : { ...current, fields, issues: [] }));
    },
    toPreview: async () => {
      if (state === null) {
        return;
      }

      const issues = mcpFieldIssues(state.fields);
      if (issues.length > 0) {
        setState({ ...state, issues });
        return;
      }

      setState({ ...state, issues: [], previewing: true, previewError: null });
      try {
        const preview = await previewMcpServer(engine, state.fields, state.editing?.id);
        setState((current) =>
          current === null ? current : { ...current, step: 'preview', preview, previewing: false },
        );
      } catch (error) {
        setState((current) =>
          current === null
            ? current
            : { ...current, previewing: false, previewError: mcpErrorOf(error) },
        );
      }
    },
    back: () => {
      setState((current) =>
        current === null ? current : { ...current, step: 'form', preview: null },
      );
    },
    confirm: async () => {
      if (state === null) {
        return;
      }

      setState({ ...state, saving: true, saveError: null });
      try {
        if (state.editing === null) {
          await mutations.create(state.fields);
        } else {
          await mutations.update(state.editing.id, state.fields);
        }
        setState(null);
      } catch (error) {
        setState((current) =>
          current === null ? current : { ...current, saving: false, saveError: mcpErrorOf(error) },
        );
      }
    },
    cancel: () => {
      setState(null);
    },
  };
}

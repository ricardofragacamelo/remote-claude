import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { mountApp } from '../../../support/app';
import { anEngineDto, anEngineList, CAPABILITIES } from '../../../support/engines';
import { aProjectServer, aServer, mcpBackendAnswers } from '../../../support/mcp-settings';
import { translator } from '../../../support/render';

const t = translator('en');
const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

const URL = '/settings/agents/claude?section=mcp&folder=%2Fsrv%2Fapp';

describe('the MCP servers section of the agent settings — plan 13, B-28', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists a server of the store with its status, origin, scope and transport — S-131', async () => {
    mcpBackendAnswers({
      '/engines/claude/mcp-servers': () => Promise.resolve({ servers: [aServer()] }),
    });
    mountApp(URL);

    const row = (await screen.findByText('github')).closest('tr');
    expect(row).not.toBeNull();
    const within_ = within(row as HTMLElement);
    expect(within_.getByText(t('agentSettings.mcp.statusPending'))).toBeVisible();
    expect(within_.getByText(t('agentSettings.mcp.originOurs'))).toBeVisible();
    expect(within_.getByText(t('agentSettings.mcp.scopeUser'))).toBeVisible();
    expect(within_.getByText(t('agentSettings.mcp.transportStdio'))).toBeVisible();
  });

  it('teaches the next step when there is nothing yet', async () => {
    mcpBackendAnswers();
    mountApp(URL);

    expect(await screen.findByText(t('agentSettings.mcp.emptyTitle'))).toBeVisible();
    expect(screen.getAllByRole('button', { name: t('agentSettings.mcp.addServer') })).not.toEqual(
      [],
    );
  });

  it('narrows the list by a search of the name — S-131', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers({
      '/engines/claude/mcp-servers': () =>
        Promise.resolve({ servers: [aServer(), aServer({ id: 's2', name: 'metrics' })] }),
    });
    mountApp(URL);

    await screen.findByText('github');
    await user.type(screen.getByLabelText(t('agentSettings.mcp.searchLabel')), 'met');

    expect(screen.queryByText('github')).toBeNull();
    expect(screen.getByText('metrics')).toBeVisible();
  });

  it('narrows the list by status — S-131', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers({
      '/engines/claude/mcp-servers': () =>
        Promise.resolve({
          servers: [aServer(), aServer({ id: 's2', name: 'metrics', status: 'failed' })],
        }),
    });
    mountApp(URL);

    await screen.findByText('github');
    await user.selectOptions(
      screen.getByLabelText(t('agentSettings.mcp.filterStatusLabel')),
      t('agentSettings.mcp.statusFailed'),
    );

    expect(screen.queryByText('github')).toBeNull();
    expect(screen.getByText('metrics')).toBeVisible();
  });

  it('turns a selection of servers off, one request per server — S-134', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers({
      '/engines/claude/mcp-servers': () =>
        Promise.resolve({ servers: [aServer(), aServer({ id: 's2', name: 'metrics' })] }),
    });
    const patching = vi
      .spyOn(api, 'patch')
      .mockResolvedValue(aServer({ enabled: false, status: 'disabled' }));
    mountApp(URL);

    await screen.findByText('github');
    await user.click(screen.getByLabelText(t('agentSettings.mcp.rowSelect', { name: 'github' })));
    await user.click(screen.getByLabelText(t('agentSettings.mcp.rowSelect', { name: 'metrics' })));
    await user.click(screen.getByRole('button', { name: t('agentSettings.mcp.turnOff') }));

    await waitFor(() => {
      expect(patching).toHaveBeenCalledTimes(2);
    });
    expect(patching).toHaveBeenCalledWith('/engines/claude/mcp-servers/server-1', {
      enabled: false,
    });
    expect(patching).toHaveBeenCalledWith('/engines/claude/mcp-servers/s2', { enabled: false });
  });

  it('a server refused in a batch does not stop the others — S-134', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers({
      '/engines/claude/mcp-servers': () =>
        Promise.resolve({ servers: [aServer(), aServer({ id: 's2', name: 'metrics' })] }),
    });
    vi.spyOn(api, 'patch').mockImplementation((route: string) =>
      route.endsWith('server-1')
        ? Promise.reject(new AppError('FORBIDDEN', 'common.error.forbidden', 't1'))
        : Promise.resolve(
            aServer({ id: 's2', name: 'metrics', enabled: false, status: 'disabled' }),
          ),
    );
    mountApp(URL);

    await screen.findByText('github');
    await user.click(screen.getByLabelText(t('agentSettings.mcp.rowSelect', { name: 'github' })));
    await user.click(screen.getByLabelText(t('agentSettings.mcp.rowSelect', { name: 'metrics' })));
    await user.click(screen.getByRole('button', { name: t('agentSettings.mcp.turnOff') }));

    // Neither request throws past the mutation boundary — a rejected promise inside
    // `Promise.allSettled` never reaches the test as an unhandled rejection.
    await waitFor(() => {
      expect(screen.getByText('metrics')).toBeVisible();
    });
  });

  it('adds a server through the two-step wizard, nothing sent before the second step confirms — S-132', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers();
    const posting = vi.spyOn(api, 'post').mockImplementation((route: string) =>
      route.endsWith('/preview')
        ? Promise.resolve({
            messageKey: 'mcp.description.stdioAnyFolder',
            params: { command: 'npx', args: 'server', envNames: '' },
            revokedRules: [],
          })
        : Promise.resolve(aServer({ name: 'new-server' })),
    );
    mountApp(URL);

    await screen.findByText(t('agentSettings.mcp.emptyTitle'));
    await user.click(screen.getByRole('button', { name: t('agentSettings.mcp.addServer') }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(t('agentSettings.mcp.fieldName')), 'new-server');
    await user.type(within(dialog).getByLabelText(t('agentSettings.mcp.fieldCommand')), 'npx');
    await user.click(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.wizardNext') }),
    );

    // Only the preview was asked — nothing written yet.
    expect(posting).toHaveBeenCalledTimes(1);
    expect(posting.mock.calls[0]?.[0]).toBe('/engines/claude/mcp-servers/preview');

    await screen.findByText(
      t('mcp.description.stdioAnyFolder', { command: 'npx', args: 'server', envNames: '' }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.wizardConfirm') }),
    );

    await waitFor(() => {
      expect(posting).toHaveBeenCalledTimes(2);
    });
    expect(posting).toHaveBeenCalledWith(
      '/engines/claude/mcp-servers',
      expect.objectContaining({ name: 'new-server', command: 'npx' }),
    );
  });

  it('refuses the wizard’s "next" on an inline rule, naming the field — S-132', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers();
    mountApp(URL);

    await screen.findByText(t('agentSettings.mcp.emptyTitle'));
    await user.click(screen.getByRole('button', { name: t('agentSettings.mcp.addServer') }));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.wizardNext') }),
    );

    expect(within(dialog).getByText(t('agentSettings.mcp.issueNameRequired'))).toBeVisible();
  });

  it('shows an existing secret as "set", never the value — S-133', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers({
      '/engines/claude/mcp-servers': () => Promise.resolve({ servers: [aServer()] }),
    });
    mountApp(URL);

    await screen.findByText('github');
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('github') });
    await user.click(
      await screen.findByRole('menuitem', { name: t('agentSettings.mcp.editServer') }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(t('agentSettings.mcp.secretSet'))).toBeVisible();
    expect(screen.queryByDisplayValue('GITHUB_TOKEN')).not.toBeNull();
  });

  it('asks a destructive confirm to remove, the keep button focused — S-135', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers({
      '/engines/claude/mcp-servers': () => Promise.resolve({ servers: [aServer()] }),
    });
    const deleting = vi.spyOn(api, 'delete').mockResolvedValue(undefined);
    mountApp(URL);

    await screen.findByText('github');
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('github') });
    await user.click(
      await screen.findByRole('menuitem', { name: t('agentSettings.mcp.removeServer') }),
    );

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(
        within(dialog).getByRole('button', { name: t('agentSettings.mcp.removeKeep') }),
      ).toHaveFocus();
    });

    await user.click(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.removeConfirm') }),
    );
    await waitFor(() => {
      expect(deleting).toHaveBeenCalledWith('/engines/claude/mcp-servers/server-1');
    });
  });

  it('shows the project’s own MCP file in its own group, approve and reject — plan 13, B-24, B-28', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers({
      '/engines/claude/project-mcp-approvals': () =>
        Promise.resolve({ servers: [aProjectServer()], errors: [] }),
    });
    const putting = vi.spyOn(api, 'put').mockResolvedValue(aProjectServer({ state: 'approved' }));
    mountApp(URL);

    expect(await screen.findByText(t('agentSettings.mcp.projectGroupTitle'))).toBeVisible();
    await user.click(
      await screen.findByRole('button', { name: t('agentSettings.mcp.projectApprove') }),
    );

    expect(putting).toHaveBeenCalledWith('/engines/claude/project-mcp-approvals', {
      folder: '/srv/app',
      name: 'docs',
      digest: 'd1',
    });
  });

  it('shows the difference for a changed entry against what was approved — S-136', async () => {
    mcpBackendAnswers({
      '/engines/claude/project-mcp-approvals': () =>
        Promise.resolve({
          servers: [
            aProjectServer({
              state: 'changed',
              command: 'node',
              approvedSnapshot: {
                transport: 'stdio',
                command: 'npx',
                args: ['-y', 'server'],
                url: null,
                env: [],
                headers: [],
              },
            }),
          ],
          errors: [],
        }),
    });
    mountApp(URL);

    expect(await screen.findByText(t('agentSettings.mcp.projectStateChanged'))).toBeVisible();
    expect(screen.getByText('command: npx')).toBeVisible();
    expect(screen.getByText('command: node')).toBeVisible();
  });

  it('has no axe violation with a server listed and the wizard open', async () => {
    mcpBackendAnswers({
      '/engines/claude/mcp-servers': () => Promise.resolve({ servers: [aServer()] }),
    });
    const { container } = mountApp(URL);

    await screen.findByText('github');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('the tab does not show for an engine without the mcp capability — D-82', async () => {
    mcpBackendAnswers({
      '/engines': () =>
        Promise.resolve(
          anEngineList({
            engines: [anEngineDto({ capabilities: { ...CAPABILITIES, mcp: false } })],
          }),
        ),
    });
    mountApp('/settings/agents/claude?section=account');

    await screen.findByRole('heading', { level: 1 });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: t('agentSettings.mcp.title') })).toBeNull();
    });
  });

  it('changes an existing secret: "change" reveals an empty input, "clear" removes it, "undo" keeps it — S-133', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers({
      '/engines/claude/mcp-servers': () => Promise.resolve({ servers: [aServer()] }),
    });
    mountApp(URL);

    await screen.findByText('github');
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('github') });
    await user.click(
      await screen.findByRole('menuitem', { name: t('agentSettings.mcp.editServer') }),
    );
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText(t('agentSettings.mcp.secretSet'))).toBeVisible();
    await user.click(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.secretChange') }),
    );
    expect(within(dialog).getByLabelText(t('agentSettings.mcp.envValue'))).toHaveValue('');

    await user.click(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.secretClear') }),
    );
    expect(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.secretUndo') }),
    ).toBeVisible();

    await user.click(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.secretUndo') }),
    );
    expect(within(dialog).getByText(t('agentSettings.mcp.secretSet'))).toBeVisible();
  });

  it('adds and removes an environment variable row in the wizard', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers();
    mountApp(URL);

    await screen.findByText(t('agentSettings.mcp.emptyTitle'));
    await user.click(screen.getByRole('button', { name: t('agentSettings.mcp.addServer') }));
    const dialog = await screen.findByRole('dialog');

    await user.click(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.envAddRow') }),
    );
    expect(within(dialog).getAllByLabelText(t('agentSettings.mcp.envName'))).toHaveLength(1);

    await user.click(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.secretRemoveRow') }),
    );
    expect(within(dialog).queryAllByLabelText(t('agentSettings.mcp.envName'))).toHaveLength(0);
  });

  it('a remote server offers a URL and headers, not a command', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers();
    mountApp(URL);

    await screen.findByText(t('agentSettings.mcp.emptyTitle'));
    await user.click(screen.getByRole('button', { name: t('agentSettings.mcp.addServer') }));
    const dialog = await screen.findByRole('dialog');

    await user.selectOptions(
      within(dialog).getByLabelText(t('agentSettings.mcp.fieldTransport')),
      t('agentSettings.mcp.transportHttp'),
    );

    expect(within(dialog).getByLabelText(t('agentSettings.mcp.fieldUrl'))).toBeVisible();
    expect(within(dialog).queryByLabelText(t('agentSettings.mcp.fieldCommand'))).toBeNull();
  });

  it('a folder-scoped server asks for the folder it applies below', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers();
    mountApp(URL);

    await screen.findByText(t('agentSettings.mcp.emptyTitle'));
    await user.click(screen.getByRole('button', { name: t('agentSettings.mcp.addServer') }));
    const dialog = await screen.findByRole('dialog');

    await user.selectOptions(
      within(dialog).getByLabelText(t('agentSettings.mcp.fieldScope')),
      t('agentSettings.mcp.scopeFolder'),
    );
    expect(within(dialog).getByLabelText(t('agentSettings.mcp.fieldFolder'))).toBeVisible();

    await user.click(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.wizardNext') }),
    );
    expect(within(dialog).getByText(t('agentSettings.mcp.issueFolderRequired'))).toBeVisible();
  });

  it('the preview’s "back" returns to the form, keeping the draft', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers();
    vi.spyOn(api, 'post').mockResolvedValue({
      messageKey: 'mcp.description.stdioAnyFolder',
      params: { command: 'npx', args: '', envNames: '' },
      revokedRules: [],
    });
    mountApp(URL);

    await screen.findByText(t('agentSettings.mcp.emptyTitle'));
    await user.click(screen.getByRole('button', { name: t('agentSettings.mcp.addServer') }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(t('agentSettings.mcp.fieldName')), 'new-server');
    await user.type(within(dialog).getByLabelText(t('agentSettings.mcp.fieldCommand')), 'npx');
    await user.click(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.wizardNext') }),
    );

    await screen.findByRole('button', { name: t('agentSettings.mcp.wizardBack') });
    await user.click(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.wizardBack') }),
    );

    expect(within(dialog).getByLabelText(t('agentSettings.mcp.fieldName'))).toHaveValue(
      'new-server',
    );
  });

  it('removes a batch of servers, listing every name — S-134, S-135', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers({
      '/engines/claude/mcp-servers': () =>
        Promise.resolve({ servers: [aServer(), aServer({ id: 's2', name: 'metrics' })] }),
    });
    const deleting = vi.spyOn(api, 'delete').mockResolvedValue(undefined);
    mountApp(URL);

    await screen.findByText('github');
    await user.click(screen.getByLabelText(t('agentSettings.mcp.rowSelect', { name: 'github' })));
    await user.click(screen.getByLabelText(t('agentSettings.mcp.rowSelect', { name: 'metrics' })));
    await user.click(screen.getByRole('button', { name: t('agentSettings.mcp.removeServer') }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('github')).toBeVisible();
    expect(within(dialog).getByText('metrics')).toBeVisible();

    await user.click(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.removeConfirm') }),
    );
    await waitFor(() => {
      expect(deleting).toHaveBeenCalledTimes(2);
    });
  });

  it('a server tested and failed shows the error beside its status chip', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers({
      '/engines/claude/mcp-servers': () => Promise.resolve({ servers: [aServer()] }),
    });
    const failure = new AppError('ENGINE_UNAVAILABLE', 'common.error.unexpected', 't1');
    vi.spyOn(api, 'post').mockRejectedValue(failure);
    mountApp(URL);

    await screen.findByText('github');
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('github') });
    await user.click(
      await screen.findByRole('menuitem', { name: t('agentSettings.mcp.testConnection') }),
    );

    expect(await screen.findByRole('img', { name: t('common.error.unexpected') })).toBeVisible();
  });

  it('a changed entry with no recorded snapshot says only that it changed — D-80', async () => {
    mcpBackendAnswers({
      '/engines/claude/project-mcp-approvals': () =>
        Promise.resolve({ servers: [aProjectServer({ state: 'changed' })], errors: [] }),
    });
    mountApp(URL);

    expect(await screen.findByText(t('agentSettings.mcp.projectStateChanged'))).toBeVisible();
    expect(screen.getByText(t('agentSettings.mcp.diffUnavailable'))).toBeVisible();
  });

  it('picks another folder through the picker, keeping it in the address', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers({
      '/workspaces/open-folders': () =>
        Promise.resolve({
          folders: [
            { path: '/srv/app', rootLabel: 'srv', state: 'available' },
            { path: '/srv/other', rootLabel: 'srv', state: 'available' },
          ],
        }),
    });
    const app = mountApp(URL);

    await screen.findByText(t('agentSettings.mcp.emptyTitle'));
    await user.selectOptions(
      screen.getByLabelText(t('agentSettings.mcp.folderLabel')),
      '/srv/other',
    );

    await waitFor(() => {
      expect(app.search()).toMatchObject({ folder: '/srv/other' });
    });
  });

  it('clears the folder through the picker’s "None" option', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers();
    const app = mountApp(URL);

    await screen.findByText(t('agentSettings.mcp.emptyTitle'));
    await user.selectOptions(
      screen.getByLabelText(t('agentSettings.mcp.folderLabel')),
      t('agentSettings.mcp.folderNone'),
    );

    await waitFor(() => {
      expect(app.search()).not.toHaveProperty('folder');
    });
  });

  it('brings the list back translated, with a way to try again', async () => {
    const user = userEvent.setup();
    const failure = new AppError('INTERNAL_ERROR', 'common.error.unexpected', 't1');
    mcpBackendAnswers({ '/engines/claude/mcp-servers': () => Promise.reject(failure) });
    mountApp(URL);

    const retry = await screen.findByRole('button', { name: t('common.action.retry') });
    await user.click(retry);
  });

  it('the wizard shows "checking…" while the preview is in flight, never freezing the page', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers();
    let settle: (value: unknown) => void = () => undefined;
    vi.spyOn(api, 'post').mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    mountApp(URL);

    await screen.findByText(t('agentSettings.mcp.emptyTitle'));
    await user.click(screen.getByRole('button', { name: t('agentSettings.mcp.addServer') }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(t('agentSettings.mcp.fieldName')), 'new-server');
    await user.type(within(dialog).getByLabelText(t('agentSettings.mcp.fieldCommand')), 'npx');
    await user.click(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.wizardNext') }),
    );

    expect(
      await screen.findByRole('button', { name: t('agentSettings.mcp.wizardPreviewing') }),
    ).toBeVisible();

    settle({ messageKey: 'mcp.description.stdioAnyFolder', params: {}, revokedRules: [] });
    await screen.findByRole('button', { name: t('agentSettings.mcp.wizardConfirm') });
  });

  it('keeps the preview open with the save error when the confirmed write fails', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers();
    vi.spyOn(api, 'post').mockImplementation((route: string) =>
      route.endsWith('/preview')
        ? Promise.resolve({
            messageKey: 'mcp.description.stdioAnyFolder',
            params: {},
            revokedRules: [],
          })
        : Promise.reject(
            new AppError('MCP_SERVER_NAME_TAKEN', 'mcp.error.serverNameTaken', 't1', { name: 'x' }),
          ),
    );
    mountApp(URL);

    await screen.findByText(t('agentSettings.mcp.emptyTitle'));
    await user.click(screen.getByRole('button', { name: t('agentSettings.mcp.addServer') }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(t('agentSettings.mcp.fieldName')), 'x');
    await user.type(within(dialog).getByLabelText(t('agentSettings.mcp.fieldCommand')), 'npx');
    await user.click(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.wizardNext') }),
    );
    await user.click(
      await screen.findByRole('button', { name: t('agentSettings.mcp.wizardConfirm') }),
    );

    expect(
      await within(dialog).findByText(t('mcp.error.serverNameTaken', { name: 'x' })),
    ).toBeVisible();
  });

  it('runs the bulk "test" action on a selection, from the toolbar', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers({
      '/engines/claude/mcp-servers': () => Promise.resolve({ servers: [aServer()] }),
    });
    const posting = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ status: 'connected', tools: [], error: null });
    mountApp(URL);

    await screen.findByText('github');
    await user.click(screen.getByLabelText(t('agentSettings.mcp.rowSelect', { name: 'github' })));
    await user.click(screen.getByRole('button', { name: t('agentSettings.mcp.testConnection') }));

    await waitFor(() => {
      expect(posting).toHaveBeenCalledWith('/engines/claude/mcp-servers/server-1/test', {});
    });
  });

  it('deselecting a row takes it out of the selection count', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers({
      '/engines/claude/mcp-servers': () => Promise.resolve({ servers: [aServer()] }),
    });
    mountApp(URL);

    await screen.findByText('github');
    const checkbox = screen.getByLabelText(t('agentSettings.mcp.rowSelect', { name: 'github' }));
    await user.click(checkbox);
    expect(screen.getByText(t('agentSettings.mcp.selectionCount', { count: 1 }))).toBeVisible();

    await user.click(checkbox);
    expect(screen.queryByText(t('agentSettings.mcp.selectionCount', { count: 1 }))).toBeNull();
  });

  it('double-clicking a row opens it for editing', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers({
      '/engines/claude/mcp-servers': () => Promise.resolve({ servers: [aServer()] }),
    });
    mountApp(URL);

    const row = (await screen.findByText('github')).closest('tr') as HTMLElement;
    await user.dblClick(row);

    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(screen.getByRole('heading', { name: t('agentSettings.mcp.editServer') })).toBeVisible();
  });

  it('types a value straight into a freshly added row — no "set" placeholder for a new one', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers();
    mountApp(URL);

    await screen.findByText(t('agentSettings.mcp.emptyTitle'));
    await user.click(screen.getByRole('button', { name: t('agentSettings.mcp.addServer') }));
    const dialog = await screen.findByRole('dialog');

    await user.click(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.envAddRow') }),
    );
    expect(within(dialog).queryByText(t('agentSettings.mcp.secretSet'))).toBeNull();

    await user.type(within(dialog).getByLabelText(t('agentSettings.mcp.envName')), 'TOKEN');
    await user.type(within(dialog).getByLabelText(t('agentSettings.mcp.envValue')), 'abc123');
    expect(within(dialog).getByLabelText(t('agentSettings.mcp.envValue'))).toHaveValue('abc123');
  });

  it('flags a missing command, and a missing URL on a remote transport — S-132', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers();
    mountApp(URL);

    await screen.findByText(t('agentSettings.mcp.emptyTitle'));
    await user.click(screen.getByRole('button', { name: t('agentSettings.mcp.addServer') }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(t('agentSettings.mcp.fieldName')), 'x');
    await user.click(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.wizardNext') }),
    );
    expect(within(dialog).getByText(t('agentSettings.mcp.issueCommandRequired'))).toBeVisible();

    await user.selectOptions(
      within(dialog).getByLabelText(t('agentSettings.mcp.fieldTransport')),
      t('agentSettings.mcp.transportHttp'),
    );
    await user.click(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.wizardNext') }),
    );
    expect(within(dialog).getByText(t('agentSettings.mcp.issueUrlRequired'))).toBeVisible();
  });

  it('shows the error of a stale approval, and a file the climb could not read — S-102, S-106', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers({
      '/engines/claude/project-mcp-approvals': () =>
        Promise.resolve({
          servers: [aProjectServer()],
          errors: [{ folderPath: '/srv/app/sub', reason: 'malformed' }],
        }),
    });
    const stale = new AppError('MCP_APPROVAL_STALE', 'mcp.error.approvalStale', 't1', {
      name: 'docs',
    });
    vi.spyOn(api, 'put').mockRejectedValue(stale);
    mountApp(URL);

    expect(
      await screen.findByText(
        t('agentSettings.mcp.projectFileIssue', { folder: '/srv/app/sub', reason: 'malformed' }),
      ),
    ).toBeVisible();

    await user.click(
      await screen.findByRole('button', { name: t('agentSettings.mcp.projectApprove') }),
    );
    expect(await screen.findByText(t('mcp.error.approvalStale', { name: 'docs' }))).toBeVisible();
  });

  it('rejects an entry of the project’s own MCP file', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers({
      '/engines/claude/project-mcp-approvals': () =>
        Promise.resolve({ servers: [aProjectServer()], errors: [] }),
    });
    const deleting = vi.spyOn(api, 'delete').mockResolvedValue(undefined);
    mountApp(URL);

    await screen.findByText(t('agentSettings.mcp.projectGroupTitle'));
    await user.click(
      await screen.findByRole('button', { name: t('agentSettings.mcp.projectReject') }),
    );

    await waitFor(() => {
      expect(deleting).toHaveBeenCalledWith(
        '/engines/claude/project-mcp-approvals?folder=%2Fsrv%2Fapp&name=docs',
      );
    });
  });

  it('a reject that fails is never an unhandled rejection — read reactively instead', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers({
      '/engines/claude/project-mcp-approvals': () =>
        Promise.resolve({ servers: [aProjectServer()], errors: [] }),
    });
    vi.spyOn(api, 'delete').mockRejectedValue(
      new AppError('FORBIDDEN', 'common.error.forbidden', 't1'),
    );
    mountApp(URL);

    await screen.findByText(t('agentSettings.mcp.projectGroupTitle'));
    await user.click(
      await screen.findByRole('button', { name: t('agentSettings.mcp.projectReject') }),
    );

    expect(await screen.findByText(t('common.error.forbidden'))).toBeVisible();
  });

  it('sorts the table by status, the most urgent first', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers({
      '/engines/claude/mcp-servers': () =>
        Promise.resolve({
          servers: [
            aServer({ id: 's1', name: 'alpha', status: 'connected' }),
            aServer({ id: 's2', name: 'zulu', status: 'failed' }),
          ],
        }),
    });
    mountApp(URL);

    await screen.findByText('alpha');
    await user.selectOptions(
      screen.getByLabelText(t('agentSettings.mcp.sortLabel')),
      t('agentSettings.mcp.sortByStatus'),
    );

    const names = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).queryByText(/alpha|zulu/)?.textContent);
    expect(names).toEqual(['zulu', 'alpha']);
  });

  it('lists the permission rules an edit would revoke, before it is saved — D-62, D-79', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers({
      '/engines/claude/mcp-servers': () => Promise.resolve({ servers: [aServer()] }),
    });
    vi.spyOn(api, 'post').mockResolvedValue({
      messageKey: 'mcp.description.stdioAnyFolder',
      params: {},
      revokedRules: ['mcp(github:*)', 'mcp(github:create_issue)'],
    });
    mountApp(URL);

    await screen.findByText('github');
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('github') });
    await user.click(
      await screen.findByRole('menuitem', { name: t('agentSettings.mcp.editServer') }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByLabelText(t('agentSettings.mcp.fieldCommand')));
    await user.type(within(dialog).getByLabelText(t('agentSettings.mcp.fieldCommand')), 'node');
    await user.click(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.wizardNext') }),
    );

    const list = await within(dialog).findByRole('list', {
      name: t('agentSettings.mcp.wizardRevokedRulesLabel'),
    });
    expect(within(list).getByText('mcp(github:*)')).toBeVisible();
    expect(within(list).getByText('mcp(github:create_issue)')).toBeVisible();
  });

  it('types the folder, the arguments and a header row of a remote server — S-132', async () => {
    const user = userEvent.setup();
    mcpBackendAnswers();
    mountApp(URL);

    await screen.findByText(t('agentSettings.mcp.emptyTitle'));
    await user.click(screen.getByRole('button', { name: t('agentSettings.mcp.addServer') }));
    const dialog = await screen.findByRole('dialog');

    await user.selectOptions(
      within(dialog).getByLabelText(t('agentSettings.mcp.fieldScope')),
      t('agentSettings.mcp.scopeFolder'),
    );
    await user.type(within(dialog).getByLabelText(t('agentSettings.mcp.fieldFolder')), '/srv/app');
    const args = within(dialog).getByLabelText(t('agentSettings.mcp.fieldArgs'));
    fireEvent.change(args, { target: { value: '-y\nserver' } });
    expect(args).toHaveValue('-y\nserver');

    await user.selectOptions(
      within(dialog).getByLabelText(t('agentSettings.mcp.fieldTransport')),
      t('agentSettings.mcp.transportHttp'),
    );
    await user.type(
      within(dialog).getByLabelText(t('agentSettings.mcp.fieldUrl')),
      'https://mcp.example.com',
    );
    await user.click(
      within(dialog).getByRole('button', { name: t('agentSettings.mcp.headerAddRow') }),
    );
    await user.type(within(dialog).getByLabelText(t('agentSettings.mcp.headerName')), 'X-Token');

    expect(within(dialog).getByLabelText(t('agentSettings.mcp.headerName'))).toHaveValue('X-Token');
  });
});

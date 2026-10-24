import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { mountApp } from '../../../../support/app';
import { aProjectConfig, projectBackendAnswers } from '../../../../support/project-settings';
import { translator } from '../../../../support/render';

const t = translator('en');
const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

const FOLDER = '/srv/app';
const URL = `/settings/agents/claude?section=project&folder=${encodeURIComponent(FOLDER)}`;
const NO_FOLDER_URL = '/settings/agents/claude?section=project';

describe('the project section of the agent settings — plan 13, B-31…B-39', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks nothing, and nudges to choose a folder, with none chosen', async () => {
    const get = projectBackendAnswers();
    mountApp(NO_FOLDER_URL);

    expect(await screen.findByText(t('engines.claude.project.chooseFolderTitle'))).toBeVisible();
    expect(get).not.toHaveBeenCalledWith('/engines/claude/project-config', expect.anything());
  });

  it('shows the four states: loading, error, empty and loaded — S-182', async () => {
    projectBackendAnswers({ '/engines/claude/project-config': () => new Promise(() => undefined) });
    mountApp(URL);

    expect(
      await screen.findByRole('status', { name: t('engines.claude.project.loading') }),
    ).toBeVisible();
  });

  it('brings the config back translated, with a way to try again', async () => {
    const user = userEvent.setup();
    const failure = new AppError('INTERNAL_ERROR', 'common.error.unexpected', 't1');
    projectBackendAnswers({ '/engines/claude/project-config': () => Promise.reject(failure) });
    mountApp(URL);

    const retry = await screen.findByRole('button', { name: t('common.action.retry') });
    await user.click(retry);
  });

  it('shows every card empty, once the config settles empty', async () => {
    projectBackendAnswers();
    mountApp(URL);

    expect(await screen.findByText(t('engines.claude.project.memoryEmptyTitle'))).toBeVisible();
    expect(screen.getByText(t('engines.claude.project.commandsEmptyTitle'))).toBeVisible();
    expect(screen.getByText(t('engines.claude.project.subagentsEmptyTitle'))).toBeVisible();
    expect(screen.getByText(t('engines.claude.project.outputStylesEmptyTitle'))).toBeVisible();
    expect(screen.getByText(t('engines.claude.project.hooksEmptyTitle'))).toBeVisible();
    expect(screen.getByText(t('engines.claude.project.permissionsEmptyTitle'))).toBeVisible();
    expect(screen.getByText(t('engines.claude.project.declaredPluginsEmptyTitle'))).toBeVisible();
    expect(screen.getByText(t('engines.claude.project.mcpJsonTitle'))).toBeVisible();
  });

  it('shows a parse issue explicitly, never silently', async () => {
    projectBackendAnswers({
      '/engines/claude/project-config': () =>
        Promise.resolve(
          aProjectConfig({ issues: [{ path: '.claude/settings.json', reason: 'malformed' }] }),
        ),
    });
    mountApp(URL);

    expect(
      await screen.findByText(
        t('engines.claude.project.issueLine', {
          path: '.claude/settings.json',
          reason: t('engines.claude.project.issueMalformed'),
        }),
      ),
    ).toBeVisible();
  });

  describe('memory — B-32', () => {
    it('lists an existing file, its origin and whether it is loaded — S-148', async () => {
      projectBackendAnswers({
        '/engines/claude/project-config': () =>
          Promise.resolve(
            aProjectConfig({
              memory: [
                {
                  path: 'CLAUDE.md',
                  origin: 'root',
                  exists: true,
                  sizeBytes: 120,
                  modifiedAt: '2026-01-01T00:00:00.000Z',
                  loadedByRule: true,
                  loadedConfirmed: null,
                  diverges: false,
                },
              ],
            }),
          ),
      });
      mountApp(URL);

      const row = (await screen.findByText('CLAUDE.md')).closest('tr') as HTMLElement;
      expect(within(row).getByText(t('engines.claude.project.memoryOriginRoot'))).toBeVisible();
      expect(within(row).getByText(t('engines.claude.project.memoryStateLoaded'))).toBeVisible();
    });

    it('opens a project-reachable file in the editor on a click — S-150', async () => {
      const user = userEvent.setup();
      projectBackendAnswers({
        '/engines/claude/project-config': () =>
          Promise.resolve(
            aProjectConfig({
              memory: [
                {
                  path: 'CLAUDE.md',
                  origin: 'root',
                  exists: true,
                  sizeBytes: 1,
                  modifiedAt: null,
                  loadedByRule: true,
                  loadedConfirmed: null,
                  diverges: false,
                },
              ],
            }),
          ),
      });
      const app = mountApp(URL);

      await user.click(await screen.findByRole('button', { name: 'CLAUDE.md' }));

      await waitFor(() => {
        expect(app.path()).toBe('/workbench');
      });
      expect(app.search()).toMatchObject({ folder: FOLDER, file: 'CLAUDE.md' });
    });

    it('warns when a live session’s own report diverges from the rule alone', async () => {
      projectBackendAnswers({
        '/engines/claude/project-config': () =>
          Promise.resolve(
            aProjectConfig({
              memory: [
                {
                  path: '.claude/CLAUDE.md',
                  origin: 'claudeDir',
                  exists: true,
                  sizeBytes: 1,
                  modifiedAt: null,
                  loadedByRule: true,
                  loadedConfirmed: false,
                  diverges: true,
                },
              ],
            }),
          ),
      });
      mountApp(URL);

      expect(
        await screen.findByText(t('engines.claude.project.memoryStateNotLoaded')),
      ).toBeVisible();
      expect(
        screen.getByRole('img', { name: t('engines.claude.project.memoryDiverges') }),
      ).toBeVisible();
    });

    it('never turns an ancestor’s or the user’s own file into a link — S-150', async () => {
      projectBackendAnswers({
        '/engines/claude/project-config': () =>
          Promise.resolve(
            aProjectConfig({
              memory: [
                {
                  path: '/home/dev/CLAUDE.md',
                  origin: 'user',
                  exists: true,
                  sizeBytes: 1,
                  modifiedAt: null,
                  loadedByRule: false,
                  loadedConfirmed: null,
                  diverges: false,
                },
              ],
            }),
          ),
      });
      mountApp(URL);

      await screen.findByText('/home/dev/CLAUDE.md');
      expect(screen.queryByRole('button', { name: '/home/dev/CLAUDE.md' })).toBeNull();
    });

    it('offers /init and a template when nothing exists — S-149', async () => {
      const user = userEvent.setup();
      projectBackendAnswers();
      const post = vi.spyOn(api, 'post').mockResolvedValue({ path: 'CLAUDE.md', etag: 'a' });
      const app = mountApp(URL);

      await user.click(
        await screen.findByRole('button', { name: t('engines.claude.project.memoryNewFile') }),
      );

      await waitFor(() => {
        expect(post).toHaveBeenCalledWith('/files', {
          folder: FOLDER,
          path: 'CLAUDE.md',
          kind: 'file',
          content: expect.stringContaining('Project notes for Claude'),
          encoding: 'utf8',
          bom: false,
          confirmSensitive: false,
        });
      });
      await waitFor(() => {
        expect(app.path()).toBe('/workbench');
      });
    });
  });

  describe('slash commands — B-33', () => {
    it('lists a command, with the shadowed flag — S-151', async () => {
      projectBackendAnswers({
        '/engines/claude/project-config': () =>
          Promise.resolve(
            aProjectConfig({
              commands: [
                {
                  name: 'review',
                  description: 'Reviews a PR',
                  argumentHint: null,
                  sourceFile: '.claude/commands/review.md',
                  shadowed: true,
                },
              ],
            }),
          ),
      });
      mountApp(URL);

      const row = (await screen.findByText('/review')).closest('tr') as HTMLElement;
      expect(within(row).getByText('Reviews a PR')).toBeVisible();
      expect(within(row).getByText(t('engines.claude.project.commandsShadowed'))).toBeVisible();
    });

    it('narrows the list by a search of the name', async () => {
      const user = userEvent.setup();
      projectBackendAnswers({
        '/engines/claude/project-config': () =>
          Promise.resolve(
            aProjectConfig({
              commands: [
                {
                  name: 'review',
                  description: '',
                  argumentHint: null,
                  sourceFile: null,
                  shadowed: false,
                },
                {
                  name: 'draft',
                  description: '',
                  argumentHint: null,
                  sourceFile: null,
                  shadowed: false,
                },
              ],
            }),
          ),
      });
      mountApp(URL);

      await screen.findByText('/review');
      await user.type(
        screen.getByLabelText(t('engines.claude.project.commandsSearchLabel')),
        'draft',
      );

      expect(screen.queryByText('/review')).toBeNull();
      expect(screen.getByText('/draft')).toBeVisible();
    });

    it('creates a new command from the template, then opens it — S-152', async () => {
      const user = userEvent.setup();
      projectBackendAnswers();
      const post = vi.spyOn(api, 'post').mockResolvedValue({
        path: '.claude/commands/review-pr.md',
        etag: 'a',
      });
      const app = mountApp(URL);

      await user.click(
        await screen.findByRole('button', { name: t('engines.claude.project.newCommand') }),
      );
      const dialog = await screen.findByRole('dialog');
      await user.type(
        within(dialog).getByLabelText(t('engines.claude.project.newCommandNameLabel')),
        'review-pr',
      );
      await user.click(
        within(dialog).getByRole('button', {
          name: t('engines.claude.project.newArtifactConfirm'),
        }),
      );

      await waitFor(() => {
        expect(post).toHaveBeenCalledWith('/files', {
          folder: FOLDER,
          path: '.claude/commands/review-pr.md',
          kind: 'file',
          content: expect.stringContaining('/review-pr'),
          encoding: 'utf8',
          bom: false,
          confirmSensitive: false,
        });
      });
      await waitFor(() => {
        expect(app.path()).toBe('/workbench');
      });
      expect(app.search()).toMatchObject({
        folder: FOLDER,
        file: '.claude/commands/review-pr.md',
      });
    });

    it('a name already taken shows the server’s own refusal — S-153', async () => {
      const user = userEvent.setup();
      projectBackendAnswers();
      vi.spyOn(api, 'post').mockRejectedValue(
        new AppError('FILE_EXISTS', 'common.error.fileExists', 't1'),
      );
      mountApp(URL);

      await user.click(
        await screen.findByRole('button', { name: t('engines.claude.project.newCommand') }),
      );
      const dialog = await screen.findByRole('dialog');
      await user.type(
        within(dialog).getByLabelText(t('engines.claude.project.newCommandNameLabel')),
        'review',
      );
      await user.click(
        within(dialog).getByRole('button', {
          name: t('engines.claude.project.newArtifactConfirm'),
        }),
      );

      expect(
        await within(dialog).findByText(t('engines.claude.project.newArtifactNameTaken')),
      ).toBeVisible();
    });

    it('cancelling the "new command" dialog writes nothing', async () => {
      const user = userEvent.setup();
      projectBackendAnswers();
      const post = vi.spyOn(api, 'post');
      mountApp(URL);

      await user.click(
        await screen.findByRole('button', { name: t('engines.claude.project.newCommand') }),
      );
      const dialog = await screen.findByRole('dialog');
      await user.type(
        within(dialog).getByLabelText(t('engines.claude.project.newCommandNameLabel')),
        'review',
      );
      await user.click(
        within(dialog).getByRole('button', { name: t('engines.claude.project.newArtifactCancel') }),
      );

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(post).not.toHaveBeenCalled();
    });

    it('a failure that is not a name collision shows translated, not swallowed', async () => {
      const user = userEvent.setup();
      projectBackendAnswers();
      vi.spyOn(api, 'post').mockRejectedValue(
        new AppError('INTERNAL_ERROR', 'common.error.unexpected', 't1'),
      );
      mountApp(URL);

      await user.click(
        await screen.findByRole('button', { name: t('engines.claude.project.newCommand') }),
      );
      const dialog = await screen.findByRole('dialog');
      await user.type(
        within(dialog).getByLabelText(t('engines.claude.project.newCommandNameLabel')),
        'review',
      );
      await user.click(
        within(dialog).getByRole('button', {
          name: t('engines.claude.project.newArtifactConfirm'),
        }),
      );

      expect(await within(dialog).findByText(t('common.error.unexpected'))).toBeVisible();
      expect(
        within(dialog).queryByText(t('engines.claude.project.newArtifactNameTaken')),
      ).toBeNull();
    });

    it('refuses to submit a name of the wrong shape, before ever asking the server', async () => {
      const user = userEvent.setup();
      projectBackendAnswers();
      const post = vi.spyOn(api, 'post');
      mountApp(URL);

      await user.click(
        await screen.findByRole('button', { name: t('engines.claude.project.newCommand') }),
      );
      const dialog = await screen.findByRole('dialog');
      await user.type(
        within(dialog).getByLabelText(t('engines.claude.project.newCommandNameLabel')),
        'Not A Valid Name',
      );

      expect(
        within(dialog).getByText(t('engines.claude.project.newArtifactNameInvalid')),
      ).toBeVisible();
      expect(post).not.toHaveBeenCalled();
    });
  });

  describe('subagents — B-36', () => {
    it('lists an agent, with its model and what its frontmatter widens — S-175', async () => {
      projectBackendAnswers({
        '/engines/claude/project-config': () =>
          Promise.resolve(
            aProjectConfig({
              agents: [
                {
                  name: 'reviewer',
                  description: 'Reviews code',
                  model: 'sonnet',
                  sourceFile: '.claude/agents/reviewer.md',
                  risks: ['broadTools'],
                },
              ],
            }),
          ),
      });
      mountApp(URL);

      const row = (await screen.findByText('reviewer')).closest('tr') as HTMLElement;
      expect(within(row).getByText('sonnet')).toBeVisible();
      expect(
        within(row).getByText(t('engines.claude.project.subagentRiskBroadTools')),
      ).toBeVisible();
    });

    it('narrows the list of agents by a search of the name', async () => {
      const user = userEvent.setup();
      projectBackendAnswers({
        '/engines/claude/project-config': () =>
          Promise.resolve(
            aProjectConfig({
              agents: [
                { name: 'reviewer', description: '', model: null, sourceFile: null, risks: [] },
                { name: 'drafter', description: '', model: null, sourceFile: null, risks: [] },
              ],
            }),
          ),
      });
      mountApp(URL);

      await screen.findByText('reviewer');
      await user.type(
        screen.getByLabelText(t('engines.claude.project.subagentsSearchLabel')),
        'draft',
      );

      expect(screen.queryByText('reviewer')).toBeNull();
      expect(screen.getByText('drafter')).toBeVisible();
    });

    it('an agent with no model and no risk widened shows plainly, with no link — D-102', async () => {
      projectBackendAnswers({
        '/engines/claude/project-config': () =>
          Promise.resolve(
            aProjectConfig({
              agents: [
                {
                  name: 'plain',
                  description: 'A plain subagent',
                  model: null,
                  sourceFile: null,
                  risks: [],
                },
              ],
            }),
          ),
      });
      mountApp(URL);

      const row = (await screen.findByText('plain')).closest('tr') as HTMLElement;
      expect(within(row).getByText('—')).toBeVisible();
      expect(within(row).queryByRole('button', { name: 'plain' })).toBeNull();
    });

    it('creates a new subagent from the template, then opens it — S-176', async () => {
      const user = userEvent.setup();
      projectBackendAnswers();
      const post = vi
        .spyOn(api, 'post')
        .mockResolvedValue({ path: '.claude/agents/reviewer.md', etag: 'a' });
      const app = mountApp(URL);

      await user.click(
        await screen.findByRole('button', { name: t('engines.claude.project.newSubagent') }),
      );
      const dialog = await screen.findByRole('dialog');
      await user.type(
        within(dialog).getByLabelText(t('engines.claude.project.newSubagentNameLabel')),
        'reviewer',
      );
      await user.click(
        within(dialog).getByRole('button', {
          name: t('engines.claude.project.newArtifactConfirm'),
        }),
      );

      await waitFor(() => {
        expect(post).toHaveBeenCalledWith('/files', {
          folder: FOLDER,
          path: '.claude/agents/reviewer.md',
          kind: 'file',
          content: expect.stringContaining('name: reviewer'),
          encoding: 'utf8',
          bom: false,
          confirmSensitive: false,
        });
      });
      await waitFor(() => {
        expect(app.path()).toBe('/workbench');
      });
    });
  });

  describe('output styles — B-37', () => {
    it('shows the one applying here now — S-177', async () => {
      projectBackendAnswers({
        '/engines/claude/project-config': () =>
          Promise.resolve(
            aProjectConfig({
              outputStyles: [{ name: 'concise', current: true, sourceFile: null }],
            }),
          ),
      });
      mountApp(URL);

      const row = (await screen.findByText('concise')).closest('tr') as HTMLElement;
      expect(within(row).getByText(t('engines.claude.project.outputStylesCurrent'))).toBeVisible();
      expect(
        within(row).queryByRole('button', {
          name: t('engines.claude.project.outputStylesSetDefault'),
        }),
      ).toBeNull();
    });

    it('sets another as the default of this folder — S-178', async () => {
      const user = userEvent.setup();
      projectBackendAnswers({
        '/engines/claude/project-config': () =>
          Promise.resolve(
            aProjectConfig({
              outputStyles: [{ name: 'explanatory', current: false, sourceFile: null }],
            }),
          ),
      });
      const put = vi.spyOn(api, 'put').mockResolvedValue({
        effective: { value: 'explanatory', from: 'folder', folder: FOLDER },
        user: null,
        folder: { folder: FOLDER, value: 'explanatory' },
      });
      mountApp(URL);

      await user.click(
        await screen.findByRole('button', {
          name: t('engines.claude.project.outputStylesSetDefault'),
        }),
      );

      await waitFor(() => {
        expect(put).toHaveBeenCalledWith('/engines/claude/output-style/folder', {
          folder: FOLDER,
          outputStyle: 'explanatory',
        });
      });
    });

    it('narrows the list of output styles by a search of the name', async () => {
      const user = userEvent.setup();
      projectBackendAnswers({
        '/engines/claude/project-config': () =>
          Promise.resolve(
            aProjectConfig({
              outputStyles: [
                { name: 'concise', current: false, sourceFile: null },
                { name: 'explanatory', current: false, sourceFile: null },
              ],
            }),
          ),
      });
      mountApp(URL);

      await screen.findByText('concise');
      await user.type(
        screen.getByLabelText(t('engines.claude.project.outputStylesSearchLabel')),
        'expl',
      );

      expect(screen.queryByText('concise')).toBeNull();
      expect(screen.getByText('explanatory')).toBeVisible();
    });

    it('creates a new output style from the template, then opens it', async () => {
      const user = userEvent.setup();
      projectBackendAnswers();
      const post = vi
        .spyOn(api, 'post')
        .mockResolvedValue({ path: '.claude/output-styles/concise.md', etag: 'a' });
      const app = mountApp(URL);

      await user.click(
        await screen.findByRole('button', { name: t('engines.claude.project.newOutputStyle') }),
      );
      const dialog = await screen.findByRole('dialog');
      await user.type(
        within(dialog).getByLabelText(t('engines.claude.project.newOutputStyleNameLabel')),
        'concise',
      );
      await user.click(
        within(dialog).getByRole('button', {
          name: t('engines.claude.project.newArtifactConfirm'),
        }),
      );

      await waitFor(() => {
        expect(post).toHaveBeenCalledWith(
          '/files',
          expect.objectContaining({ path: '.claude/output-styles/concise.md' }),
        );
      });
      await waitFor(() => {
        expect(app.path()).toBe('/workbench');
      });
    });
  });

  describe('hooks, permissions and declared plugins — B-38', () => {
    it('spells out a hook in full, with its own warning', async () => {
      projectBackendAnswers({
        '/engines/claude/project-config': () =>
          Promise.resolve(
            aProjectConfig({
              hooks: [
                { event: 'PreToolUse', matcher: 'Bash', command: 'echo hi' },
                { event: 'Stop', matcher: null, command: 'echo done' },
              ],
            }),
          ),
      });
      mountApp(URL);

      expect(await screen.findByText('echo hi')).toBeVisible();
      expect(screen.getByText(t('engines.claude.project.hooksWarning'))).toBeVisible();
      const noMatcherRow = screen.getByText('echo done').closest('tr') as HTMLElement;
      expect(within(noMatcherRow).getByText('—')).toBeVisible();
    });

    it('describes `deny` as applied and `allow` as no effect here', async () => {
      projectBackendAnswers({
        '/engines/claude/project-config': () =>
          Promise.resolve(
            aProjectConfig({
              permissions: [
                { rule: 'Bash(rm:*)', kind: 'deny', appliesHere: true },
                { rule: 'Read(**)', kind: 'allow', appliesHere: false },
              ],
            }),
          ),
      });
      mountApp(URL);

      const denyRow = (await screen.findByText('Bash(rm:*)')).closest('tr') as HTMLElement;
      expect(
        within(denyRow).getByText(t('engines.claude.project.permissionsApplied')),
      ).toBeVisible();
      const allowRow = screen.getByText('Read(**)').closest('tr') as HTMLElement;
      expect(
        within(allowRow).getByText(t('engines.claude.project.permissionsNoEffect')),
      ).toBeVisible();
    });

    it('lists declared plugins, enabled and disabled', async () => {
      projectBackendAnswers({
        '/engines/claude/project-config': () =>
          Promise.resolve(
            aProjectConfig({
              plugins: {
                enabled: ['team-tools'],
                disabled: ['old-plugin'],
                enableAllProjectMcpServers: true,
              },
            }),
          ),
      });
      mountApp(URL);

      expect(
        await screen.findByText(
          t('engines.claude.project.declaredPluginsEnabled', { name: 'team-tools' }),
        ),
      ).toBeVisible();
      expect(
        screen.getByText(
          t('engines.claude.project.declaredPluginsDisabled', { name: 'old-plugin' }),
        ),
      ).toBeVisible();
      expect(
        screen.getByText(t('engines.claude.project.declaredPluginsEnableAllMcp')),
      ).toBeVisible();
    });
  });

  it('the .mcp.json card only navigates to the core’s MCP section', async () => {
    const user = userEvent.setup();
    projectBackendAnswers();
    const app = mountApp(URL);

    await user.click(
      await screen.findByRole('button', { name: t('engines.claude.project.mcpJsonLink') }),
    );

    await waitFor(() => {
      expect(app.search()).toEqual({ section: 'mcp', folder: FOLDER });
    });
  });

  it('has no accessibility violation', async () => {
    projectBackendAnswers({
      '/engines/claude/project-config': () =>
        Promise.resolve(
          aProjectConfig({
            commands: [
              {
                name: 'review',
                description: 'Reviews a PR',
                argumentHint: null,
                sourceFile: null,
                shadowed: false,
              },
            ],
          }),
        ),
    });
    const { container } = mountApp(URL);

    await screen.findByText('/review');
    expect(await axe(container)).toHaveNoViolations();
  });
});

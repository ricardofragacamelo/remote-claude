import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { mountApp } from '../../../../support/app';
import { aSkill, skillBackendAnswers } from '../../../../support/skill-settings';
import { translator } from '../../../../support/render';

const t = translator('en');
const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

const FOLDER = '/srv/app';
const URL = `/settings/agents/claude?section=skills&folder=${encodeURIComponent(FOLDER)}`;
const NO_FOLDER_URL = '/settings/agents/claude?section=skills';

describe('the skills section of the agent settings — plan 13, B-34, B-39, S-182', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks nothing of the skills, and nudges to choose a folder, with none chosen', async () => {
    const get = skillBackendAnswers();
    mountApp(NO_FOLDER_URL);

    expect(await screen.findByText(t('engines.claude.skills.chooseFolderTitle'))).toBeVisible();
    expect(get).not.toHaveBeenCalledWith('/engines/claude/skills', expect.anything());
  });

  it('lists a skill with its origin, description and state — S-154', async () => {
    skillBackendAnswers({
      '/engines/claude/skills': () => Promise.resolve({ skills: [aSkill()] }),
    });
    mountApp(URL);

    const row = (await screen.findByText('review')).closest('tr');
    expect(row).not.toBeNull();
    const withinRow = within(row as HTMLElement);
    expect(withinRow.getByText(t('engines.claude.skills.originProject'))).toBeVisible();
    expect(withinRow.getByText('Reviews a PR')).toBeVisible();
    expect(withinRow.getByText(t('engines.claude.skills.stateEnabled'))).toBeVisible();
  });

  it('lists a colliding project and user skill of the same name, both — S-157', async () => {
    skillBackendAnswers({
      '/engines/claude/skills': () =>
        Promise.resolve({
          skills: [
            aSkill({ origin: 'project' }),
            aSkill({ origin: 'user', sourceFile: null, enabled: false }),
          ],
        }),
    });
    mountApp(URL);

    const rows = await screen.findAllByText('review');
    expect(rows).toHaveLength(2);
  });

  it('shows why a candidate a declared hook kept out is unloaded — B-35, S-167', async () => {
    skillBackendAnswers({
      '/engines/claude/skills': () =>
        Promise.resolve({
          skills: [
            aSkill({
              origin: 'user',
              sourceFile: null,
              enabled: false,
              unloadedReason: 'declaresHook',
            }),
          ],
        }),
    });
    mountApp(URL);

    expect(await screen.findByText(t('engines.claude.skills.unloadedDeclaresHook'))).toBeVisible();
  });

  it('teaches the next step when the folder has no skill at all', async () => {
    skillBackendAnswers();
    mountApp(URL);

    expect(await screen.findByText(t('engines.claude.skills.emptyTitle'))).toBeVisible();
  });

  it('narrows the list by a search of the name', async () => {
    const user = userEvent.setup();
    skillBackendAnswers({
      '/engines/claude/skills': () =>
        Promise.resolve({ skills: [aSkill(), aSkill({ name: 'draft' })] }),
    });
    mountApp(URL);

    await screen.findByText('review');
    await user.type(screen.getByLabelText(t('engines.claude.skills.searchLabel')), 'draft');

    expect(screen.queryByText('review')).toBeNull();
    expect(screen.getByText('draft')).toBeVisible();
  });

  it('narrows the list by the origin filter', async () => {
    const user = userEvent.setup();
    skillBackendAnswers({
      '/engines/claude/skills': () =>
        Promise.resolve({
          skills: [aSkill({ origin: 'project' }), aSkill({ name: 'draft', origin: 'user' })],
        }),
    });
    mountApp(URL);

    await screen.findByText('review');
    await user.selectOptions(
      screen.getByLabelText(t('engines.claude.skills.filterOriginLabel')),
      t('engines.claude.skills.originUser'),
    );

    expect(screen.queryByText('review')).toBeNull();
    expect(screen.getByText('draft')).toBeVisible();
  });

  it('turns a selection of skills off, with one whole PUT per toggle — S-162', async () => {
    const user = userEvent.setup();
    skillBackendAnswers({
      '/engines/claude/skills': () =>
        Promise.resolve({
          skills: [aSkill(), aSkill({ name: 'draft' })],
        }),
    });
    const put = vi.spyOn(api, 'put').mockResolvedValue({ sources: {}, disabledSkills: [] });
    mountApp(URL);

    await screen.findByText('review');
    await user.click(
      screen.getByLabelText(t('engines.claude.skills.rowSelect', { name: 'review' })),
    );
    await user.click(
      screen.getByLabelText(t('engines.claude.skills.rowSelect', { name: 'draft' })),
    );
    await user.click(screen.getByRole('button', { name: t('engines.claude.skills.turnOff') }));

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith('/engines/claude/skills/preferences', {
        folder: FOLDER,
        sources: {},
        disabledSkills: ['draft', 'review'],
      });
    });
  });

  it('opens a project skill in the editor on a double click — plan 07', async () => {
    const user = userEvent.setup();
    skillBackendAnswers({
      '/engines/claude/skills': () =>
        Promise.resolve({ skills: [aSkill({ sourceFile: '.claude/skills/review/SKILL.md' })] }),
    });
    const app = mountApp(URL);

    const row = (await screen.findByText('review')).closest('tr') as HTMLElement;
    await user.dblClick(row);

    await waitFor(() => {
      expect(app.path()).toBe('/workbench');
    });
    expect(app.search()).toMatchObject({
      folder: FOLDER,
      file: '.claude/skills/review/SKILL.md',
    });
  });

  it('a skill with no file of its own stays put on a double click — D-20', async () => {
    const user = userEvent.setup();
    skillBackendAnswers({
      '/engines/claude/skills': () =>
        Promise.resolve({ skills: [aSkill({ origin: 'user', sourceFile: null })] }),
    });
    const app = mountApp(URL);

    const row = (await screen.findByText('review')).closest('tr') as HTMLElement;
    await user.dblClick(row);

    expect(app.path()).toBe('/settings/agents/claude');
  });

  it('narrows the list by the state filter', async () => {
    const user = userEvent.setup();
    skillBackendAnswers({
      '/engines/claude/skills': () =>
        Promise.resolve({
          skills: [aSkill(), aSkill({ name: 'draft', enabled: false })],
        }),
    });
    mountApp(URL);

    await screen.findByText('review');
    await user.selectOptions(
      screen.getByLabelText(t('engines.claude.skills.filterStateLabel')),
      t('engines.claude.skills.filterStateDisabled'),
    );

    expect(screen.queryByText('review')).toBeNull();
    expect(screen.getByText('draft')).toBeVisible();
  });

  it('turns a selection of disabled skills on, in one whole PUT — S-162', async () => {
    const user = userEvent.setup();
    skillBackendAnswers({
      '/engines/claude/skills': () =>
        Promise.resolve({
          skills: [aSkill({ enabled: false })],
        }),
    });
    const put = vi.spyOn(api, 'put').mockResolvedValue({ sources: {}, disabledSkills: [] });
    mountApp(URL);

    await screen.findByText('review');
    await user.click(
      screen.getByLabelText(t('engines.claude.skills.rowSelect', { name: 'review' })),
    );
    await user.click(screen.getByRole('button', { name: t('engines.claude.skills.turnOn') }));

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith('/engines/claude/skills/preferences', {
        folder: FOLDER,
        sources: {},
        disabledSkills: [],
      });
    });
  });

  it('turning the system origin on asks first too, with its own wording', async () => {
    const user = userEvent.setup();
    skillBackendAnswers({
      '/engines/claude/skills': () =>
        Promise.resolve({
          skills: [aSkill({ origin: 'system', sourceFile: null, enabled: false })],
        }),
    });
    const put = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ sources: { system: true }, disabledSkills: [] });
    mountApp(URL);

    const toggle = await screen.findByLabelText(t('engines.claude.skills.originSystemSwitch'));
    expect(toggle).not.toBeChecked();
    await user.click(toggle);

    const dialog = await screen.findByRole('dialog', {
      name: t('engines.claude.skills.enableOriginTitle', {
        origin: t('engines.claude.skills.originSystem'),
      }),
    });
    expect(
      within(dialog).getByText(t('engines.claude.skills.enableOriginDescriptionSystem')),
    ).toBeVisible();
    expect(within(dialog).getByText('review')).toBeVisible();

    await user.click(
      within(dialog).getByRole('button', { name: t('engines.claude.skills.enableOriginConfirm') }),
    );

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith('/engines/claude/skills/preferences', {
        folder: FOLDER,
        sources: { system: true },
        disabledSkills: [],
      });
    });
  });

  it('turning the system origin off saves at once too, same asymmetry as the user’s', async () => {
    const user = userEvent.setup();
    skillBackendAnswers({
      '/engines/claude/skills': () => Promise.resolve({ skills: [] }),
      '/engines/claude/skills/preferences': () =>
        Promise.resolve({
          effective: { value: { sources: { system: true }, disabledSkills: [] }, from: 'user' },
          user: { sources: { system: true }, disabledSkills: [] },
          folder: null,
        }),
    });
    const put = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ sources: { system: false }, disabledSkills: [] });
    mountApp(URL);

    const toggle = await screen.findByLabelText(t('engines.claude.skills.originSystemSwitch'));
    expect(toggle).toBeChecked();
    await user.click(toggle);

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith('/engines/claude/skills/preferences', {
        folder: FOLDER,
        sources: { system: false },
        disabledSkills: [],
      });
    });
  });

  it('turning the user origin off saves at once, no confirm — D-20’s asymmetry', async () => {
    const user = userEvent.setup();
    skillBackendAnswers({
      '/engines/claude/skills': () => Promise.resolve({ skills: [] }),
      '/engines/claude/skills/preferences': () =>
        Promise.resolve({
          effective: { value: { sources: { user: true }, disabledSkills: [] }, from: 'user' },
          user: { sources: { user: true }, disabledSkills: [] },
          folder: null,
        }),
    });
    const put = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ sources: { user: false }, disabledSkills: [] });
    mountApp(URL);

    const toggle = await screen.findByLabelText(t('engines.claude.skills.originUserSwitch'));
    expect(toggle).toBeChecked();
    await user.click(toggle);

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith('/engines/claude/skills/preferences', {
        folder: FOLDER,
        sources: { user: false },
        disabledSkills: [],
      });
    });
    expect(screen.queryByText(t('engines.claude.skills.enableOriginConfirm'))).toBeNull();
  });

  it('turning the user origin on asks first, showing what is about to load — S-182', async () => {
    const user = userEvent.setup();
    skillBackendAnswers({
      '/engines/claude/skills': () =>
        Promise.resolve({ skills: [aSkill({ origin: 'user', sourceFile: null, enabled: false })] }),
    });
    const put = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ sources: { user: true }, disabledSkills: [] });
    mountApp(URL);

    const toggle = await screen.findByLabelText(t('engines.claude.skills.originUserSwitch'));
    expect(toggle).not.toBeChecked();
    await user.click(toggle);

    const dialog = await screen.findByRole('dialog', {
      name: t('engines.claude.skills.enableOriginTitle', {
        origin: t('engines.claude.skills.originUser'),
      }),
    });
    expect(within(dialog).getByText('review')).toBeVisible();
    expect(put).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole('button', { name: t('engines.claude.skills.enableOriginConfirm') }),
    );

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith('/engines/claude/skills/preferences', {
        folder: FOLDER,
        sources: { user: true },
        disabledSkills: [],
      });
    });
  });

  it('cancelling the "turn on" confirm saves nothing', async () => {
    const user = userEvent.setup();
    skillBackendAnswers({
      '/engines/claude/skills': () => Promise.resolve({ skills: [] }),
    });
    const put = vi.spyOn(api, 'put');
    mountApp(URL);

    await user.click(await screen.findByLabelText(t('engines.claude.skills.originUserSwitch')));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: t('engines.claude.skills.enableOriginCancel') }),
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(put).not.toHaveBeenCalled();
  });

  it('brings the list back translated, with a way to try again', async () => {
    const user = userEvent.setup();
    const failure = new AppError('INTERNAL_ERROR', 'common.error.unexpected', 't1');
    skillBackendAnswers({ '/engines/claude/skills': () => Promise.reject(failure) });
    mountApp(URL);

    const retry = await screen.findByRole('button', { name: t('common.action.retry') });
    await user.click(retry);
  });

  it('has no accessibility violation', async () => {
    skillBackendAnswers({
      '/engines/claude/skills': () => Promise.resolve({ skills: [aSkill()] }),
    });
    const { container } = mountApp(URL);

    await screen.findByText('review');
    expect(await axe(container)).toHaveNoViolations();
  });
});

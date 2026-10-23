import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { ServerForm } from '@/features/mcp/components/ServerForm';
import type { McpServerFields } from '@/features/mcp/types/mcp';
import { render } from '../../../support/render';
import { translator } from '../../../support/render';

const t = translator('en');

const STDIO: McpServerFields = {
  name: 'github',
  scope: 'user',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', 'server'],
  env: [
    { name: 'A', value: 'a' },
    { name: 'B', value: 'b' },
  ],
};

describe('ServerForm — plan 13, B-28, S-132', () => {
  it('switching to http replaces the stdio fields, and back again', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ServerForm
        fields={STDIO}
        issues={[]}
        existingSecretNames={new Set()}
        folderChoices={[]}
        onChange={onChange}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText(t('agentSettings.mcp.fieldTransport')),
      t('agentSettings.mcp.transportHttp'),
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ transport: 'http', url: '', headers: [] }),
    );

    onChange.mockClear();
    const remote: McpServerFields = { ...STDIO, transport: 'http', url: 'https://x', headers: [] };
    const { rerender } = render(
      <ServerForm
        fields={remote}
        issues={[]}
        existingSecretNames={new Set()}
        folderChoices={[]}
        onChange={onChange}
      />,
    );
    await user.selectOptions(
      screen.getAllByLabelText(t('agentSettings.mcp.fieldTransport'))[1] as HTMLElement,
      t('agentSettings.mcp.transportStdio'),
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ transport: 'stdio', command: '', args: [], env: [] }),
    );
    rerender(<></>);
  });

  it('switching to folder scope keeps the folder path, switching back to user clears it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ServerForm
        fields={STDIO}
        issues={[]}
        existingSecretNames={new Set()}
        folderChoices={[]}
        onChange={onChange}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText(t('agentSettings.mcp.fieldScope')),
      t('agentSettings.mcp.scopeFolder'),
    );
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'folder' }));

    onChange.mockClear();
    const folderScoped: McpServerFields = { ...STDIO, scope: 'folder', folderPath: '/srv/app' };
    render(
      <ServerForm
        fields={folderScoped}
        issues={[]}
        existingSecretNames={new Set()}
        folderChoices={[]}
        onChange={onChange}
      />,
    );
    await user.selectOptions(
      screen.getAllByLabelText(t('agentSettings.mcp.fieldScope'))[1] as HTMLElement,
      t('agentSettings.mcp.scopeUser'),
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ scope: 'user', folderPath: undefined }),
    );
  });

  it('editing one secret row leaves the others exactly as they were', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ServerForm
        fields={STDIO}
        issues={[]}
        existingSecretNames={new Set(['A', 'B'])}
        folderChoices={[]}
        onChange={onChange}
      />,
    );

    const names = screen.getAllByLabelText(t('agentSettings.mcp.envName'));
    await user.clear(names[1] as HTMLElement);
    await user.type(names[1] as HTMLElement, 'C');

    const lastCall = onChange.mock.calls.at(-1)?.[0] as McpServerFields;
    expect(lastCall.env?.[0]).toEqual({ name: 'A', value: 'a' });
  });

  it('changing the value of one secret row leaves the others exactly as they were', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ServerForm
        fields={STDIO}
        issues={[]}
        existingSecretNames={new Set(['A', 'B'])}
        folderChoices={[]}
        onChange={onChange}
      />,
    );

    const values = screen.getAllByLabelText(t('agentSettings.mcp.envValue'));
    await user.clear(values[1] as HTMLElement);
    await user.type(values[1] as HTMLElement, 'z');

    const lastCall = onChange.mock.calls.at(-1)?.[0] as McpServerFields;
    expect(lastCall.env?.[0]).toEqual({ name: 'A', value: 'a' });
  });

  it('renders every optional field blank when a draft leaves them out — never a crash', () => {
    const sparse: McpServerFields = { name: '', scope: 'user', transport: 'stdio' };
    render(
      <ServerForm
        fields={sparse}
        issues={[]}
        existingSecretNames={new Set()}
        folderChoices={[]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(t('agentSettings.mcp.fieldCommand'))).toHaveValue('');
    expect(screen.getByLabelText(t('agentSettings.mcp.fieldArgs'))).toHaveValue('');
    expect(screen.queryAllByLabelText(t('agentSettings.mcp.envName'))).toEqual([]);
  });

  it('adds the first variable row when the draft started with none at all', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const sparse: McpServerFields = { name: '', scope: 'user', transport: 'stdio' };
    render(
      <ServerForm
        fields={sparse}
        issues={[]}
        existingSecretNames={new Set()}
        folderChoices={[]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: t('agentSettings.mcp.envAddRow') }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ env: [{ name: '', value: '' }] }),
    );
  });

  it('renders every optional remote field blank when a draft leaves them out', () => {
    const sparse: McpServerFields = { name: '', scope: 'user', transport: 'http' };
    render(
      <ServerForm
        fields={sparse}
        issues={[]}
        existingSecretNames={new Set()}
        folderChoices={[]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(t('agentSettings.mcp.fieldUrl'))).toHaveValue('');
    expect(screen.queryAllByLabelText(t('agentSettings.mcp.headerName'))).toEqual([]);
  });

  it('adds the first header row when the draft started with none at all', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const sparse: McpServerFields = { name: '', scope: 'user', transport: 'http' };
    render(
      <ServerForm
        fields={sparse}
        issues={[]}
        existingSecretNames={new Set()}
        folderChoices={[]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: t('agentSettings.mcp.headerAddRow') }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ headers: [{ name: '', value: '' }] }),
    );
  });

  it('removing a secret row leaves only the others', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ServerForm
        fields={STDIO}
        issues={[]}
        existingSecretNames={new Set(['A', 'B'])}
        folderChoices={[]}
        onChange={onChange}
      />,
    );

    const remove = screen.getAllByRole('button', { name: t('agentSettings.mcp.secretRemoveRow') });
    await user.click(remove[0] as HTMLElement);

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ env: [{ name: 'B', value: 'b' }] }),
    );
  });

  it('has no axe violation', async () => {
    const { container } = render(
      <ServerForm
        fields={STDIO}
        issues={[]}
        existingSecretNames={new Set(['A', 'B'])}
        folderChoices={['/srv/app']}
        onChange={vi.fn()}
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});

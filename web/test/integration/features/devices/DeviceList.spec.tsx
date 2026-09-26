import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { DeviceList } from '@/features/devices';
import { api } from '@/shared/api/api';
import { render, translator } from '../../../support/render';

const t = translator('en');

const pendingDevice = {
  id: 'dev_1',
  name: 'Pixel 8',
  platform: 'android',
  appVersion: '1.0.0',
  locale: 'pt-BR',
  status: 'pending',
  pushEnabled: true,
  registeredAt: '2026-09-18T10:00:00.000Z',
  lastSeenAt: '2026-09-18T10:00:00.000Z',
  approvedAt: null,
  revokedAt: null,
};

const approvedDevice = {
  ...pendingDevice,
  id: 'dev_2',
  name: 'Old tablet',
  status: 'approved',
  approvedAt: '2026-09-18T11:00:00.000Z',
};

/** A failure shaped the way `api.ts` hands one on. */
const forbidden = {
  code: 'FORBIDDEN',
  messageKey: 'common.error.forbidden',
  params: {},
  traceId: 'trace-1',
};

describe('the devices screen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A never-settling request, which is what the loading state actually looks like. */
  function pending(): void {
    vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined));
  }

  function answers(...devices: readonly unknown[]): void {
    vi.spyOn(api, 'get').mockResolvedValue({ devices });
  }

  it('shows the loading state while the devices are on their way', () => {
    pending();
    render(<DeviceList />);

    expect(screen.getByLabelText(t('devices.list.loading'))).toBeInTheDocument();
  });

  it('shows the devices once they arrive', async () => {
    answers(pendingDevice, approvedDevice);
    render(<DeviceList />);

    expect(await screen.findByText('Pixel 8')).toBeInTheDocument();
    expect(screen.getByText('Old tablet')).toBeInTheDocument();
  });

  it('says where each device stands, in words', async () => {
    answers(pendingDevice, approvedDevice);
    render(<DeviceList />);

    expect(await screen.findByText(t('devices.status.pending'))).toBeInTheDocument();
    expect(screen.getByText(t('devices.status.approved'))).toBeInTheDocument();
  });

  it('says when a device was last seen, which is how somebody recognises their own', async () => {
    answers(pendingDevice);
    render(<DeviceList />);

    expect(
      await screen.findByText(t('devices.row.lastSeen', { at: pendingDevice.lastSeenAt })),
    ).toBeInTheDocument();
  });

  it('says when a device has no push token, because that changes what it is good for', async () => {
    answers({ ...pendingDevice, pushEnabled: false });
    render(<DeviceList />);

    expect(await screen.findByText(t('devices.row.noPush'))).toBeInTheDocument();
  });

  it('shows the empty state, which explains rather than reporting nothing', async () => {
    answers();
    render(<DeviceList />);

    expect(await screen.findByText(t('devices.list.emptyTitle'))).toBeInTheDocument();
    expect(screen.getByText(t('devices.list.emptyDescription'))).toBeInTheDocument();
  });

  it('shows the error state with the trace, so the failure can be reported', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(forbidden);
    render(<DeviceList />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(t('common.error.traceLabel', { traceId: 'trace-1' })),
    ).toBeInTheDocument();
  });

  it('retries from the error state, and shows what the retry found', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockRejectedValueOnce(forbidden)
      .mockResolvedValueOnce({ devices: [pendingDevice] });

    render(<DeviceList />);
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: t('common.action.retry') }));

    expect(await screen.findByText('Pixel 8')).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  describe('approving', () => {
    it('offers the action only on a device that is waiting', async () => {
      answers(pendingDevice, approvedDevice);
      render(<DeviceList />);

      expect(
        await screen.findByRole('button', { name: t('devices.action.approve') }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: t('devices.action.approve') })).toHaveLength(1);
    });

    it('replaces the row it changed rather than reloading the list', async () => {
      const get = vi.spyOn(api, 'get').mockResolvedValue({ devices: [pendingDevice] });
      vi.spyOn(api, 'post').mockResolvedValue({ ...pendingDevice, status: 'approved' });

      render(<DeviceList />);
      await userEvent.click(
        await screen.findByRole('button', { name: t('devices.action.approve') }),
      );

      expect(await screen.findByText(t('devices.status.approved'))).toBeInTheDocument();
      // The list is sorted by last seen, and reloading it under somebody's cursor is how the
      // wrong device gets revoked.
      expect(get).toHaveBeenCalledTimes(1);
    });

    it('shows the failure of an approval where the list was', async () => {
      answers(pendingDevice);
      vi.spyOn(api, 'post').mockRejectedValue(forbidden);

      render(<DeviceList />);
      await userEvent.click(
        await screen.findByRole('button', { name: t('devices.action.approve') }),
      );

      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });
  });

  describe('revoking', () => {
    it('offers the action only on a device that is approved', async () => {
      answers(pendingDevice, approvedDevice);
      render(<DeviceList />);

      expect(
        await screen.findByRole('button', { name: t('devices.action.revoke') }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: t('devices.action.revoke') })).toHaveLength(1);
    });

    // Revoking is destructive: it asks first, and it names what it is about to do.
    it('asks before it revokes, naming the device', async () => {
      answers(approvedDevice);
      const send = vi.spyOn(api, 'request').mockResolvedValue(approvedDevice);

      render(<DeviceList />);
      await userEvent.click(
        await screen.findByRole('button', { name: t('devices.action.revoke') }),
      );

      expect(
        screen.getByText(t('devices.confirm.description', { name: 'Old tablet' })),
      ).toBeInTheDocument();
      expect(send).not.toHaveBeenCalled();
    });

    // A destructive action one stray Enter away is one that eventually happens by accident.
    it('puts the focus on the way out, not on the destruction', async () => {
      answers(approvedDevice);
      render(<DeviceList />);

      await userEvent.click(
        await screen.findByRole('button', { name: t('devices.action.revoke') }),
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: t('devices.confirm.cancel') })).toHaveFocus();
      });
    });

    it('backs out without touching anything', async () => {
      answers(approvedDevice);
      const send = vi.spyOn(api, 'request').mockResolvedValue(approvedDevice);

      render(<DeviceList />);
      await userEvent.click(
        await screen.findByRole('button', { name: t('devices.action.revoke') }),
      );
      await userEvent.click(screen.getByRole('button', { name: t('devices.confirm.cancel') }));

      expect(send).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: t('devices.action.revoke') })).toBeInTheDocument();
    });

    it('revokes once confirmed, and shows the device as revoked', async () => {
      answers(approvedDevice);
      const send = vi
        .spyOn(api, 'request')
        .mockResolvedValue({ ...approvedDevice, status: 'revoked' });

      render(<DeviceList />);
      await userEvent.click(
        await screen.findByRole('button', { name: t('devices.action.revoke') }),
      );
      await userEvent.click(screen.getByRole('button', { name: t('devices.confirm.confirm') }));

      expect(await screen.findByText(t('devices.status.revoked'))).toBeInTheDocument();
      expect(send).toHaveBeenCalledWith('/devices/dev_2/approval', { method: 'DELETE' });
    });

    it('shows the failure of a revocation where the list was', async () => {
      answers(approvedDevice);
      vi.spyOn(api, 'request').mockRejectedValue(forbidden);

      render(<DeviceList />);
      await userEvent.click(
        await screen.findByRole('button', { name: t('devices.action.revoke') }),
      );
      await userEvent.click(screen.getByRole('button', { name: t('devices.confirm.confirm') }));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
    });

    it('offers nothing to do to a device that is already revoked', async () => {
      answers({ ...approvedDevice, status: 'revoked' });
      render(<DeviceList />);

      await screen.findByText(t('devices.status.revoked'));

      expect(screen.queryByRole('button', { name: t('devices.action.revoke') })).toBeNull();
      expect(screen.queryByRole('button', { name: t('devices.action.approve') })).toBeNull();
    });
  });

  it('has no accessibility violation with devices on screen', async () => {
    answers(pendingDevice, approvedDevice);
    const { container } = render(<DeviceList />);
    await screen.findByText('Pixel 8');

    expect(await axe(container)).toHaveNoViolations();
  });
});

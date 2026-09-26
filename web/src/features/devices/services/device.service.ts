import { api } from '@/shared/api/api';
import type { Device } from '../types/device';

/** The shape the backend answers with. It stops existing at the end of this file. */
interface DeviceListResponse {
  readonly devices: readonly Device[];
}

/**
 * The devices of this user.
 *
 * A service knows the endpoint, its shape and how to read the answer — and nothing about React or
 * about when it should be called.
 *
 * @throws {import('@/shared/api/errors').AppError} never a raw `Response`
 */
export async function fetchDevices(): Promise<readonly Device[]> {
  return (await api.get<DeviceListResponse>('/devices')).devices;
}

/**
 * Lets a device decide.
 *
 * The browser is the only client that may call this, and it is the browser's **not** sending the
 * installation header that makes it so — see the backend's `CallingDevice`. There is nothing to
 * add here for that: this client is not a device and has no header to send.
 */
export async function approveDevice(deviceId: string): Promise<Device> {
  return api.post<Device>(`/devices/${encodeURIComponent(deviceId)}/approval`, {});
}

/** Takes a device out. The row stays — the record that it was revoked is the point. */
export async function revokeDevice(deviceId: string): Promise<Device> {
  return api.request<Device>(`/devices/${encodeURIComponent(deviceId)}/approval`, {
    method: 'DELETE',
  });
}

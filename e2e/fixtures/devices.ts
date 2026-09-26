import { randomUUID } from 'node:crypto';

import { expect } from '@playwright/test';

import { callApi } from './api';
import { E2eSocket } from './ws';
import type { AuthenticatedUser } from './auth';

/**
 * A phone, from the outside: registered, approved or revoked through the same HTTP API the app and
 * the browser use, and connected with the installation in the handshake the way the app connects.
 *
 * Nothing here imports `mobile/` — the point of this level is that the contract works for anybody
 * who speaks it. The app's own suite proves the same flows through its screens; this one runs on
 * every pull request, which is what makes up for that one not being a gate.
 */

/** One installation of the app, as the backend knows it. */
export interface Phone {
  readonly installId: string;
  readonly deviceId: string;
}

/** Registers a new installation. It is born **pending**: it may watch and may not decide. */
export async function registerPhone(user: AuthenticatedUser): Promise<Phone> {
  const installId = `e2e-${randomUUID()}`;
  const response = await callApi(user, '/devices', {
    method: 'POST',
    installId,
    body: { installId, name: 'e2e phone', platform: 'android', appVersion: 'e2e' },
  });

  expect(response.status).toBe(201);
  const device = (await response.json()) as { id: string; status: string };
  expect(device.status).toBe('pending');

  return { installId, deviceId: device.id };
}

/** Approves a phone **from the browser** — no installation header, which is the whole rule. */
export async function approvePhone(user: AuthenticatedUser, phone: Phone): Promise<void> {
  const response = await callApi(user, `/devices/${phone.deviceId}/approval`, { method: 'POST' });
  expect(response.status).toBe(200);
}

/** Revokes a phone from the browser. */
export async function revokePhone(user: AuthenticatedUser, phone: Phone): Promise<void> {
  const response = await callApi(user, `/devices/${phone.deviceId}/approval`, { method: 'DELETE' });
  expect(response.status).toBe(200);
}

/** A registered and approved phone — the one that may answer. */
export async function approvedPhone(user: AuthenticatedUser): Promise<Phone> {
  const phone = await registerPhone(user);
  await approvePhone(user, phone);
  return phone;
}

/** Opens the socket of [phone], authenticated the way the app authenticates. */
export async function connectedPhone(user: AuthenticatedUser, phone: Phone): Promise<E2eSocket> {
  const socket = await E2eSocket.open();
  await socket.authenticate(user.accessToken, phone.installId);
  return socket;
}

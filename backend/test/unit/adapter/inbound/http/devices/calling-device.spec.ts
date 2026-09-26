import { describe, expect, it } from 'vitest';
import type { Request } from 'express';

import { INSTALL_ID_HEADER, callingInstallId } from '@adapter/inbound/http/devices/calling-device';

/** Headers, in the shape Express hands them over. */
const headers = (value?: string | string[]): Request['headers'] =>
  (value === undefined ? {} : { [INSTALL_ID_HEADER]: value }) as Request['headers'];

describe('the installation a request names', () => {
  it('is the header, when the app sent one', () => {
    expect(callingInstallId(headers('install-1'))).toBe('install-1');
  });

  // A browser never sends it, and that absence is exactly what the approval rule reads: a device
  // does not approve a device (D-02).
  it('is null for a browser, which sends no such header', () => {
    expect(callingInstallId(headers())).toBeNull();
  });

  // Something meaning "a device, but a nameless one" would be a third case for every caller to
  // handle, and there is nothing it could be.
  it('is null for an empty header, which is the same as none', () => {
    expect(callingInstallId(headers(''))).toBeNull();
  });

  // A proxy, or a client with a bug, can send it twice. The first wins — a decision, rather than
  // whatever the runtime happened to do, which would differ between machines.
  it('is the first value when the header arrives twice', () => {
    expect(callingInstallId(headers(['install-1', 'install-2']))).toBe('install-1');
  });

  it('is null when it arrives twice and the first is empty', () => {
    expect(callingInstallId(headers(['', 'install-2']))).toBeNull();
  });
});

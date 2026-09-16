import { webcrypto } from 'node:crypto';
import { afterEach, expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { toHaveNoViolations } from 'jest-axe';

expect.extend(matchers);
// Accessibility is checked on every main screen, and a violation breaks the build: this product
// has a screen where somebody authorises a shell command — docs/architecture/web/06-testing.md.
expect.extend(toHaveNoViolations);

// jsdom ships a partial `crypto`; PKCE needs `subtle` and `randomUUID`, which the platform has.
if (globalThis.crypto?.subtle === undefined) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

afterEach(() => {
  cleanup();
});

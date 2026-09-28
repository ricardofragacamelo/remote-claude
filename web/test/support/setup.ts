import { webcrypto } from 'node:crypto';
import { afterEach, expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup, configure } from '@testing-library/react';
import { toHaveNoViolations } from 'jest-axe';

expect.extend(matchers);
// Accessibility is checked on every main screen, and a violation breaks the build: this product
// has a screen where somebody authorises a shell command — docs/architecture/web/06-testing.md.
expect.extend(toHaveNoViolations);

// jsdom ships a partial `crypto`; PKCE needs `subtle` and `randomUUID`, which the platform has.
if (globalThis.crypto?.subtle === undefined) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

// How long `waitFor` and `findBy` wait for something that is asynchronous by design — a route that
// resolves, a load that answers. The library's second is a bet on the speed of the machine, and
// `verify:full` loses it: the backend's suite measures its coverage beside this one, containers
// and all. Five seconds only changes how long a true condition may take; a false one still fails
// (plan 05, cycle 18).
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
});

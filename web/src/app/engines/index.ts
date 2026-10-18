/**
 * The composition root of the engines' extensions (ADR-025, docs/architecture/shared/12-engines.md):
 * the one file of the core allowed to import `@/engines/*`. Importing it registers every enabled
 * extension's sections, navigation entry, defaults field and shortcuts into the core's own
 * registries — before the app renders (`main.tsx`), and before a test's own router is built
 * (`router.tsx`, so `mountApp` sees the same registrations the real app does).
 *
 * Adding a second engine means one more line here — nowhere else in the core. Under `app/engines/`,
 * not `app/engines.ts`: the neutrality gate exempts any path segment named `engines`, the same way
 * it exempts `web/src/engines/claude/` itself, and this file names one by construction.
 */
import '@/engines/claude/register';

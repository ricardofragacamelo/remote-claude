import { z } from 'zod';

/**
 * The workspace allowlist file, as a schema — the one both readers of the file validate against.
 *
 * The backend reads it at boot and on `SIGHUP`; `pnpm allowlist` writes it. One schema and not two:
 * two copies would drift, and the day they did the script would write a file the backend refuses
 * to boot on — or, worse, accept one the backend reads differently
 * ([06 · D-09](../../../docs/plans/06-workbench/decisions.md#d-09--onde-mora-a-cópia-local-da-allowlist-e-como-o-boot-a-escolhe)).
 *
 * This file imports nothing but zod, and nothing relative, on purpose: the script is plain `.mjs`
 * run by Node, which strips the types of this file and would not resolve an extensionless import.
 *
 * It is the one piece of configuration that does **not** live in an environment variable, and the
 * exception is declared: this list is the first line of defence of the product, it grows with a
 * comment per root and with the owner of each root, and changing it has to mean touching the disk
 * of the machine. See docs/plans/01-live-session/decisions.md#d-02 and
 * docs/architecture/shared/07-repository-layout.md#configuração-e-segredo.
 */
export const workspaceRootSchema = z.object({
  /** Absolute path of the root. Relative is refused by the loader, not normalised. */
  path: z.string().min(1),
  /** What the UI calls it. */
  label: z.string().min(1),
  /** OIDC subjects allowed to reach it. A root nobody may use is a typo, not a configuration. */
  users: z.array(z.string().min(1)).min(1),
});

export const workspaceAllowlistSchema = z.object({
  roots: z.array(workspaceRootSchema).min(1),
});

/** The file, as it is written. */
export type RawWorkspaceAllowlist = z.infer<typeof workspaceAllowlistSchema>;

/** One root, as it is written. */
export type RawWorkspaceRoot = z.infer<typeof workspaceRootSchema>;

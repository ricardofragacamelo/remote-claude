/**
 * The notifications the notification centre may keep, and the parameters each one interpolates.
 *
 * A closed list, on purpose. The history lives on the server (06 · D-17) and it stores a
 * `messageKey` and `params` — nothing else — so the one thing standing between it and a store of
 * arbitrary text is that the key is one we know and the parameters are the ones that key takes. A
 * key the client made up, or a parameter smuggling a command line, is refused before anything is
 * written (plan 06, S-174).
 *
 * Every key here is one the web has to translate, and `pnpm i18n:check` proves it does: the keys
 * are written as `messageKey` entries, which is what the check reads the backend for. A notification
 * a later plan emits is added here, in the same change that adds its translation (06 · D-19).
 */
export const NOTIFICATION_CATALOGUE: readonly NotificationKind[] = [
  // A command of the palette or the File menu that failed with no place on the screen to say so.
  { messageKey: 'notification.command.failed', params: ['command', 'code'] },
  // The server refused to store the folder tabs; they stay open in this window.
  { messageKey: 'notification.tabs.saveFailed', params: ['code'] },
  // The connection to the machine was lost, and came back.
  { messageKey: 'notification.connection.lost', params: [] },
  { messageKey: 'notification.connection.restored', params: [] },
  // A folder with an open tab is no longer allowed.
  { messageKey: 'notification.folder.notAllowed', params: ['folder'] },
];

/** One kind of notification: its key, and the names of the parameters it interpolates. */
export interface NotificationKind {
  readonly messageKey: string;
  readonly params: readonly string[];
}

/** What a notification may interpolate: a short value, never a structure. */
export type NotificationParams = Readonly<Record<string, string | number | boolean>>;

/** The longest text a parameter may carry — a path or a code, never a paragraph. */
export const NOTIFICATION_PARAM_MAX_LENGTH = 512;

/** Why a notification was refused, one entry per problem, in the shape of a validation detail. */
export interface NotificationProblem {
  readonly field: string;
  readonly rule: 'notInCatalogue' | 'unexpected' | 'missing' | 'tooLong';
}

/**
 * Every problem a notification has against the catalogue; empty when it may be kept.
 *
 * The parameters have to be exactly the ones the key takes — an extra one is where content would
 * hide, and a missing one is a sentence that renders with a hole in it.
 *
 * @param catalogue the kinds admitted
 */
export function problemsOf(
  messageKey: string,
  params: NotificationParams,
  catalogue: readonly NotificationKind[] = NOTIFICATION_CATALOGUE,
): NotificationProblem[] {
  const kind = catalogue.find((candidate) => candidate.messageKey === messageKey);

  if (kind === undefined) {
    return [{ field: 'messageKey', rule: 'notInCatalogue' }];
  }

  const given = Object.keys(params);

  return [
    ...given
      .filter((name) => !kind.params.includes(name))
      .map((name) => ({ field: `params.${name}`, rule: 'unexpected' as const })),
    ...kind.params
      .filter((name) => !given.includes(name))
      .map((name) => ({ field: `params.${name}`, rule: 'missing' as const })),
    ...given
      .filter((name) => String(params[name]).length > NOTIFICATION_PARAM_MAX_LENGTH)
      .map((name) => ({ field: `params.${name}`, rule: 'tooLong' as const })),
  ];
}

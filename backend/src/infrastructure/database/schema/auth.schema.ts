import { check, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { auditColumns } from './columns';

/**
 * The `devices` table: which installations of the app may decide something, and which may not.
 *
 * **The unique key is the pair `(user_id, install_id)`, and it is born composite.** The identity
 * belongs to the installation, the approval belongs to the user: with `install_id` alone, user B
 * registering on the same phone would overwrite user A's already approved row and inherit the
 * approval in silence — the exact opposite of what registration exists to guarantee. Adding the
 * column later would be a migration over a table with data in it
 * (docs/architecture/backend/05-persistence.md#o-device-do-celular, D-10).
 *
 * `push_token` is nullable because a device with no token still watches sessions, and because a
 * token the provider refuses is erased while the device stays approved (D-13).
 */
export const devices = pgTable(
  'devices',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    /** Minted by the app on first run, kept in the OS secure storage. Never an OS identifier. */
    installId: text('install_id').notNull(),
    name: text('name').notNull(),
    platform: text('platform').notNull(),
    appVersion: text('app_version').notNull(),
    pushToken: text('push_token'),
    locale: text('locale').notNull(),
    status: text('status').notNull(),
    registeredAt: timestamp('registered_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex('devices_user_id_install_id_key').on(table.userId, table.installId),
    // The listing is "the devices of one user, most recently seen first", and the handshake looks
    // one up by `(user_id, install_id)` — which the unique index above already serves.
    index('devices_user_id_last_seen_at_idx').on(table.userId, table.lastSeenAt.desc()),
    // The sweep of forgotten registrations reads exactly this.
    index('devices_status_registered_at_idx').on(table.status, table.registeredAt),
    check('devices_status_known', sql`${table.status} IN ('pending', 'approved', 'revoked')`),
    check('devices_platform_known', sql`${table.platform} IN ('android', 'ios')`),
    check('devices_locale_known', sql`${table.locale} IN ('en', 'pt-BR')`),
    // A device cannot be approved without saying when, and cannot be revoked without saying when.
    // The state and its instant are one fact, and a row that carries half of it is a row nobody
    // can audit.
    check(
      'devices_approved_has_instant',
      sql`${table.status} <> 'approved' OR ${table.approvedAt} IS NOT NULL`,
    ),
    check(
      'devices_revoked_has_instant',
      sql`${table.status} <> 'revoked' OR ${table.revokedAt} IS NOT NULL`,
    ),
  ],
);

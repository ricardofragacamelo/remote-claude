import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { SkillPreferencesRepository } from '@application/engines/claude';
import type { UserId } from '@domain/auth';
import type { SkillPreferences, SkillPreferencesDefaults } from '@domain/engines/claude';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { claudeSkillPreferences } from '@infra/database/schema';
import { runLogged } from '../../persistence/query-logging';

type SkillPreferencesRow = typeof claudeSkillPreferences.$inferSelect;

/**
 * One row of `claude_skill_preferences`, read back into the domain's own shape. Both columns are
 * `NOT NULL` with a default at the schema (`0020`), so there is no "absent" case to fall back on
 * here — the row is the value, whole.
 */
function preferencesOf(row: SkillPreferencesRow): SkillPreferences {
  return {
    sources: row.sources as SkillPreferences['sources'],
    disabledSkills: row.disabledSkills,
  };
}

/**
 * `claude_skill_preferences`, in PostgreSQL — which sources of skills are on, and which skills are
 * off, for each user (`folder_path` NULL) and for each folder (plan 13, B-34; D-20). No surrogate
 * key: the unique pair `(user_id, folder_path)` is the row's own identity, the same choice the
 * migration already made (`0020`).
 *
 * A save is `INSERT … ON CONFLICT DO UPDATE` on the unique key, so the last one wins whole (S-162).
 */
@Injectable()
export class DrizzleSkillPreferencesRepository implements SkillPreferencesRepository {
  constructor(@Inject(PERSISTENCE_CONTEXT) private readonly context: PersistenceContext) {}

  async read(userId: UserId): Promise<SkillPreferencesDefaults> {
    const rows = await runLogged(
      this.context.logger,
      'skillPreferences.read',
      this.context.db
        .select()
        .from(claudeSkillPreferences)
        .where(eq(claudeSkillPreferences.userId, userId.value)),
    );

    const userRow = rows.find((row) => row.folderPath === null);

    return {
      user: userRow === undefined ? null : preferencesOf(userRow),
      overrides: rows.flatMap((row) =>
        row.folderPath === null ? [] : [{ folder: row.folderPath, value: preferencesOf(row) }],
      ),
    };
  }

  async save(userId: UserId, folder: string | null, preferences: SkillPreferences): Promise<void> {
    await runLogged(
      this.context.logger,
      'skillPreferences.save',
      this.context.db
        .insert(claudeSkillPreferences)
        .values({
          userId: userId.value,
          folderPath: folder,
          sources: preferences.sources,
          disabledSkills: [...preferences.disabledSkills],
        })
        .onConflictDoUpdate({
          target: [claudeSkillPreferences.userId, claudeSkillPreferences.folderPath],
          set: {
            sources: preferences.sources,
            disabledSkills: [...preferences.disabledSkills],
            updatedAt: this.context.clock.now(),
          },
        }),
    );
  }
}

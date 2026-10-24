import { ExternalLink, Power, PowerOff } from 'lucide-react';

import { workbenchLocation } from '@/app/workbench-location';
import type { SkillView } from '../types/skill';

/** What a skill's own row offers — never the batch the toolbar does (plan 13, B-39). */
export interface SkillRowActionHandlers {
  onToggleSkill(skill: SkillView, enabled: boolean): void;
  openInEditor(href: string): void;
}

/**
 * One row's context menu actions, pure of any rendering: turn the skill on or off, and — only for a
 * project skill, the one kind this folder's own allowlist can open — jump to its file (plan 07).
 */
export function skillRowActions(
  skill: SkillView,
  folder: string,
  handlers: SkillRowActionHandlers,
): readonly {
  id: string;
  labelKey: string;
  icon: typeof Power;
  available(): boolean;
  run(): void;
}[] {
  return [
    skill.enabled
      ? {
          id: 'skill.turnOff',
          labelKey: 'engines.claude.skills.turnOff',
          icon: PowerOff,
          available: () => true,
          run: () => {
            handlers.onToggleSkill(skill, false);
          },
        }
      : {
          id: 'skill.turnOn',
          labelKey: 'engines.claude.skills.turnOn',
          icon: Power,
          available: () => true,
          run: () => {
            handlers.onToggleSkill(skill, true);
          },
        },
    ...(skill.sourceFile === null
      ? []
      : [
          {
            id: 'skill.openInEditor',
            labelKey: 'engines.claude.skills.openInEditor',
            icon: ExternalLink,
            available: () => true,
            run: () => {
              handlers.openInEditor(
                workbenchLocation({ folder, file: skill.sourceFile as string }),
              );
            },
          },
        ]),
  ];
}

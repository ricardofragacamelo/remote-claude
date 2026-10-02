import { useTranslation } from 'react-i18next';

import { useSessionSettings } from '../../hooks/useSessionSettings';
import { ContextMeter } from './ContextMeter';
import { ExportControl } from './ExportControl';
import { McpIndicator } from './McpIndicator';
import { ModelPicker, ModePicker } from './SessionChoices';

export interface SessionHeaderProps {
  readonly folder: string;
  readonly sessionId: string;
  readonly conversationId: string | null;
  onCompact(): void;
}

/**
 * What runs the conversation, at a glance and in reach (plan 08, B-36…B-39): the model and the mode
 * of the session, how full its context is, its MCP servers, and the export.
 */
export function SessionHeader({
  folder,
  sessionId,
  conversationId,
  onCompact,
}: SessionHeaderProps): React.JSX.Element {
  const { t } = useTranslation();
  const settings = useSessionSettings(folder, sessionId);

  return (
    <div
      className="flex flex-wrap items-start gap-1"
      role="group"
      aria-label={t('sessions.header.label')}
    >
      <ModelPicker models={settings.models} current={settings.model} onPick={settings.setModel} />
      <ModePicker current={settings.mode} onPick={settings.setMode} />
      <ContextMeter sessionId={sessionId} onCompact={onCompact} />
      <McpIndicator sessionId={sessionId} />
      <ExportControl conversationId={conversationId} folder={folder} />
    </div>
  );
}

import type { RuleExport } from '../types/rule';

/** `remote-claude-rules-2026-11-11.json` — today's own date, the installation's own clock. */
export function ruleExportFileName(now: Date): string {
  return `remote-claude-rules-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Saves the export payload as a file, the one way the web ever writes to the visitor's own disk —
 * a `Blob` URL and a click `<a>` never attached to the page, released right after (plan 15, B-31).
 */
export function downloadRuleExportFile(payload: RuleExport, now: Date): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = ruleExportFileName(now);
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

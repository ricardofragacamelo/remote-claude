/**
 * The ids the agent's panel had before plan 28 named it after no engine (B-39) — what a shortcut, a
 * kept tab or a link of an older build may still say. Each is read once, as the id it has now, and
 * kept under the new one from then on. One place, so the window of the previous names closes here.
 */
const FORMER_NAME = 'claude';

/** The id the panel's part of a kept folder tab had. */
export const FORMER_PANEL_RESTORER_ID = `session.${FORMER_NAME}Panel`;

/**
 * The ids a command of the panel had — `agent.focusComposer` was `<former name>.focusComposer` —, so
 * a binding, a link or a test that still names one reaches it. None for a command that was never
 * renamed.
 */
export function formerCommandIdsOf(id: string): readonly string[] {
  return id.startsWith('agent.') ? [`${FORMER_NAME}.${id.slice('agent.'.length)}`] : [];
}

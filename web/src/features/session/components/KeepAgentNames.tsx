import { useAgentNamesKept } from '../hooks/useEngines';

/**
 * Keeps the names of the coding agents where every translation finds them — the `{{agent}}` of the
 * errors of every screen (plan 28, B-13). Rendered once, by the frame of the app; it draws nothing.
 */
export function KeepAgentNames(): null {
  useAgentNamesKept();
  return null;
}

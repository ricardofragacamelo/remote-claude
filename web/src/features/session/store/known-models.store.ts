import { create } from 'zustand';

import type { InstallationModel } from '../types/insight';

/**
 * The models the installation said it has, last time a session of a folder asked — what a draft of
 * that folder offers before its session exists (plan 08, D-13). With nothing known, a draft offers
 * only the installation's default (S-172).
 */
export const useKnownModels = create<{
  readonly byFolder: Readonly<Record<string, readonly InstallationModel[]>>;
}>(() => ({ byFolder: {} }));

export function rememberModels(folder: string, models: readonly InstallationModel[]): void {
  useKnownModels.setState((state) => ({ byFolder: { ...state.byFolder, [folder]: models } }));
}

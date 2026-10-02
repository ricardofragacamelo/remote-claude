import { afterEach, describe, expect, it, vi } from 'vitest';

import * as loader from '@/features/editor/lib/engine-loader';
import { colorizeCode, languageOfFence, tokensOfColorized } from '@/features/editor/lib/highlight';
import type { CodeEditorEngine } from '@/features/editor/types/code-editor';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('colouring a block of code as the editor does — plan 08 B-15', () => {
  it.each([
    ['ts', 'typescript'],
    [' Python ', 'python'],
    ['json', 'json'],
    ['typescript', 'typescript'],
    ['', 'plaintext'],
    ['klingon', 'plaintext'],
  ])('reads the fence %j as %s — S-65', (fence, language) => {
    expect(languageOfFence(fence)).toBe(language);
  });

  it('keeps only the class and the text of each run, line by line, never the markup', () => {
    const html =
      '<div><span class="mtk1">const</span><span class="mtk2"> a</span><br/>' +
      '<span class="mtk3"><img src=x onerror="alert(1)">b</span></div>';

    expect(tokensOfColorized(html)).toEqual([
      [
        { className: 'mtk1', text: 'const' },
        { className: 'mtk2', text: ' a' },
      ],
      [{ className: 'mtk3', text: 'b' }],
    ]);
  });

  it('gives a run with no element around it no class, and keeps no comment', () => {
    expect(tokensOfColorized('plain<!-- note -->')).toEqual([[{ className: '', text: 'plain' }]]);
  });

  it('colours nothing for plain text, without loading the engine — S-65', async () => {
    const load = vi.spyOn(loader, 'loadEngine');

    await expect(colorizeCode('x', 'klingon')).resolves.toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('colours with the engine of the editor, when it colours', async () => {
    const colorize = vi.fn().mockResolvedValue('<span class="mtk5">x</span>');
    vi.spyOn(loader, 'loadEngine').mockResolvedValue({ colorize } as unknown as CodeEditorEngine);

    await expect(colorizeCode('x', 'ts')).resolves.toEqual([[{ className: 'mtk5', text: 'x' }]]);
    expect(colorize).toHaveBeenCalledWith('x', 'typescript');
  });

  it('colours nothing with an engine that cannot', async () => {
    vi.spyOn(loader, 'loadEngine').mockResolvedValue({} as CodeEditorEngine);

    await expect(colorizeCode('x', 'ts')).resolves.toBeNull();
  });
});

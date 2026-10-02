import { describe, expect, it } from 'vitest';

import { folded } from '@/shared/lib/folded';

describe('text as a search compares it', () => {
  it('drops case and accents', () => {
    expect(folded('Ação Rápida')).toBe('acao rapida');
  });

  it('leaves text with neither as it was', () => {
    expect(folded('deploy')).toBe('deploy');
  });
});

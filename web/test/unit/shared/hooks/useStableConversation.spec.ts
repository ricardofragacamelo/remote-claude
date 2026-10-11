import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useStableConversation } from '@/shared/hooks/useStableConversation';
import type { ConversationRef } from '@/shared/lib/conversation';

describe('useStableConversation — plan 28, B-13', () => {
  it('keeps the same reference while it names the same conversation', () => {
    const { result, rerender } = renderHook(
      ({ conversation }: { conversation: ConversationRef | null }) =>
        useStableConversation(conversation),
      {
        initialProps: {
          conversation: { engine: 'claude', id: 'c1' } as ConversationRef | null,
        },
      },
    );
    const first = result.current;

    rerender({ conversation: { engine: 'claude', id: 'c1' } });
    expect(result.current).toBe(first);
    expect(first).toEqual({ engine: 'claude', id: 'c1' });

    rerender({ conversation: { engine: 'other', id: 'c1' } });
    expect(result.current).toEqual({ engine: 'other', id: 'c1' });
    expect(result.current).not.toBe(first);

    rerender({ conversation: null });
    expect(result.current).toBeNull();
  });
});

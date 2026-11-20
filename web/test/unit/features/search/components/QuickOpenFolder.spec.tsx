import { describe, expect, it } from 'vitest';
import { render, renderHook } from '@testing-library/react';

import { QuickOpenFolder } from '@/features/search/components/QuickOpenFolder';
import { useQuickOpenFolder } from '@/features/search/hooks/useQuickOpenFolder';

describe('QuickOpenFolder — plan 11, B-14', () => {
  it('renders nothing, and marks its folder mounted for Quick Open to read', () => {
    const read = renderHook(() => useQuickOpenFolder());
    const { container, unmount } = render(<QuickOpenFolder folder="/srv/projects/a" />);

    expect(container).toBeEmptyDOMElement();
    read.rerender();
    expect(read.result.current).toBe('/srv/projects/a');

    unmount();
    read.rerender();
    expect(read.result.current).toBeNull();
  });
});

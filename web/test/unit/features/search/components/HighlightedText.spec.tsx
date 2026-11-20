import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { HighlightedText } from '@/features/search/components/HighlightedText';

describe('HighlightedText — plan 11, B-14', () => {
  it('renders plain text untouched when nothing matched', () => {
    const { container } = render(<HighlightedText text="readme.md" positions={[]} />);

    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toBe('readme.md');
  });

  it('marks only the matched characters, merging adjacent ones into one run', () => {
    const { container } = render(<HighlightedText text="readme.md" positions={[0, 1, 2, 3]} />);

    const marks = Array.from(container.querySelectorAll('mark')).map((mark) => mark.textContent);
    expect(marks).toEqual(['read']);
    expect(container.textContent).toBe('readme.md');
  });

  it('marks non-adjacent matches as separate runs, in order', () => {
    const { container } = render(<HighlightedText text="readme.md" positions={[0, 4]} />);

    const marks = Array.from(container.querySelectorAll('mark')).map((mark) => mark.textContent);
    expect(marks).toEqual(['r', 'm']);
    expect(container.textContent).toBe('readme.md');
  });

  it('marks the whole text when every character matched', () => {
    const { container } = render(<HighlightedText text="abc" positions={[0, 1, 2]} />);

    expect(Array.from(container.querySelectorAll('mark')).map((mark) => mark.textContent)).toEqual([
      'abc',
    ]);
  });

  it('ignores a position past the end of the text', () => {
    const { container } = render(<HighlightedText text="abc" positions={[0, 99]} />);

    expect(container.textContent).toBe('abc');
    expect(Array.from(container.querySelectorAll('mark')).map((mark) => mark.textContent)).toEqual([
      'a',
    ]);
  });
});

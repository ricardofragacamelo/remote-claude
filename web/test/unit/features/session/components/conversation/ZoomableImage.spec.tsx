import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { ZoomableImage } from '@/features/session/components/conversation/ZoomableImage';

/**
 * The one zoom component of the product (plan 27, F6 · B-22, D-08, S-108): scroll to zoom in,
 * drag once zoomed to pan — shared by the prompt's own image dialog (plan 22) and a tool's own
 * attachment, never a second implementation of the same gesture.
 */
describe('ZoomableImage — plan 27, F6 · B-22, S-108', () => {
  it('draws the image at rest, with no transform offset', () => {
    render(<ZoomableImage src="blob:x" alt="a picture" />);

    const img = screen.getByAltText('a picture');
    expect(img.style.transform).toContain('scale(1)');
  });

  it('scrolling up scales the image in, within the 1–8 ceiling', () => {
    render(<ZoomableImage src="blob:x" alt="a picture" />);
    const img = screen.getByAltText('a picture');
    const box = img.parentElement!;

    for (let tick = 0; tick < 50; tick += 1) {
      fireEvent.wheel(box, { deltaY: -500 });
    }

    const match = /scale\(([\d.]+)\)/.exec(img.style.transform);
    const scale = match === null ? 0 : Number(match[1]);
    expect(scale).toBeGreaterThan(1);
    expect(scale).toBeLessThanOrEqual(8);
  });

  it('dragging while at rest (scale 1) moves nothing — there is nothing to pan yet', () => {
    render(<ZoomableImage src="blob:x" alt="a picture" />);
    const img = screen.getByAltText('a picture');
    const box = img.parentElement!;

    fireEvent.pointerDown(box, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(box, { clientX: 40, clientY: 40, pointerId: 1 });

    expect(img.style.transform).toContain('translate(0px, 0px)');
  });

  it("once zoomed, dragging pans the image by the pointer's own movement", () => {
    render(<ZoomableImage src="blob:x" alt="a picture" />);
    const img = screen.getByAltText('a picture');
    const box = img.parentElement!;

    for (let tick = 0; tick < 50; tick += 1) {
      fireEvent.wheel(box, { deltaY: -500 });
    }

    fireEvent.pointerDown(box, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(box, { clientX: 30, clientY: 10, pointerId: 1 });

    expect(img.style.transform).toContain('translate(30px, 10px)');

    fireEvent.pointerUp(box, { pointerId: 1 });
    // A move after the drag ended changes nothing — the drag is over.
    fireEvent.pointerMove(box, { clientX: 90, clientY: 90, pointerId: 1 });
    expect(img.style.transform).toContain('translate(30px, 10px)');
  });

  it('scrolling back down to rest clears any pan, not just the zoom', () => {
    render(<ZoomableImage src="blob:x" alt="a picture" />);
    const img = screen.getByAltText('a picture');
    const box = img.parentElement!;

    for (let tick = 0; tick < 50; tick += 1) {
      fireEvent.wheel(box, { deltaY: -500 });
    }
    fireEvent.pointerDown(box, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(box, { clientX: 30, clientY: 10, pointerId: 1 });
    fireEvent.pointerLeave(box, { pointerId: 1 });

    for (let tick = 0; tick < 50; tick += 1) {
      fireEvent.wheel(box, { deltaY: 500 });
    }

    expect(img.style.transform).toContain('scale(1)');
    expect(img.style.transform).toContain('translate(0px, 0px)');
  });
});

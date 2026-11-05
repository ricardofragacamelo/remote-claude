import { useRef, useState } from 'react';

/** How far in a person can go — the same ceiling the app's own `InteractiveViewer` gives
 * (`maxScale: 8`, plan 22, B-33) — and how far a single step of the wheel moves. */
const MAX_SCALE = 8;
const MIN_SCALE = 1;
const WHEEL_STEP = 0.0015;

/** A point on the image, in its own unscaled pixels. */
interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * An image a person can zoom into and pan around — scroll (or pinch, on a trackpad) to zoom,
 * drag once zoomed to move (plan 27, F6 · B-22, D-08, S-108). The one zoom component of the
 * product: the dialog that opens a prompt's own image (plan 22) uses this same one, never a
 * second implementation of the same gesture.
 */
export function ZoomableImage({
  src,
  alt,
}: {
  readonly src: string;
  readonly alt: string;
}): React.JSX.Element {
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragging = useRef<{ readonly start: Point; readonly origin: Point } | null>(null);

  function onWheel(event: React.WheelEvent<HTMLDivElement>): void {
    event.preventDefault();
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale - event.deltaY * WHEEL_STEP));
    setScale(next);
    if (next === MIN_SCALE) {
      setOffset({ x: 0, y: 0 });
    }
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (scale === MIN_SCALE) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = { start: { x: event.clientX, y: event.clientY }, origin: offset };
    setIsDragging(true);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = dragging.current;
    if (drag === null) {
      return;
    }
    setOffset({
      x: drag.origin.x + (event.clientX - drag.start.x),
      y: drag.origin.y + (event.clientY - drag.start.y),
    });
  }

  function endDrag(): void {
    dragging.current = null;
    setIsDragging(false);
  }

  return (
    <div
      className="flex max-h-[70vh] max-w-full items-center justify-center self-center overflow-hidden"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      style={{ cursor: scale > MIN_SCALE ? 'grab' : undefined }}
    >
      <img
        src={src}
        alt={alt}
        className="max-h-[70vh] max-w-full object-contain"
        style={{
          transform: `translate(${String(offset.x)}px, ${String(offset.y)}px) scale(${String(scale)})`,
          transition: isDragging ? undefined : 'transform 0.05s ease-out',
        }}
        draggable={false}
      />
    </div>
  );
}

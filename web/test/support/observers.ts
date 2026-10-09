import { vi } from 'vitest';
import { act } from '@testing-library/react';

/** What a test does to the observers of the page: says which elements came near, or a size. */
export interface FakeObservers {
  /** The elements every intersection observer watches now. */
  watched(): readonly Element[];

  /** These elements came near the view — or left it. */
  near(elements: readonly Element[], isNear?: boolean): void;

  /** An element was resized to `width`. */
  resize(element: Element, width: number): void;
}

/**
 * Intersection and resize observers a test drives, standing in for the ones jsdom lacks — it lays
 * nothing out, so nothing is ever near nor of any size until the test says so.
 */
export function fakeObservers(): FakeObservers {
  const intersections = new Set<{
    readonly targets: Set<Element>;
    readonly callback: IntersectionObserverCallback;
    readonly self: IntersectionObserver;
  }>();
  const resizes = new Set<{
    readonly targets: Set<Element>;
    readonly callback: ResizeObserverCallback;
    readonly self: ResizeObserver;
  }>();

  class FakeIntersection {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds = [];
    private readonly entry;
    constructor(callback: IntersectionObserverCallback) {
      this.entry = {
        targets: new Set<Element>(),
        callback,
        self: this as unknown as IntersectionObserver,
      };
      intersections.add(this.entry);
    }
    observe(target: Element): void {
      this.entry.targets.add(target);
    }
    unobserve(target: Element): void {
      this.entry.targets.delete(target);
    }
    disconnect(): void {
      intersections.delete(this.entry);
    }
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  class FakeResize {
    private readonly entry;
    constructor(callback: ResizeObserverCallback) {
      this.entry = {
        targets: new Set<Element>(),
        callback,
        self: this as unknown as ResizeObserver,
      };
      resizes.add(this.entry);
    }
    observe(target: Element): void {
      this.entry.targets.add(target);
    }
    unobserve(target: Element): void {
      this.entry.targets.delete(target);
    }
    disconnect(): void {
      resizes.delete(this.entry);
    }
  }

  vi.stubGlobal('IntersectionObserver', FakeIntersection);
  vi.stubGlobal('ResizeObserver', FakeResize);

  return {
    watched: () => [...intersections].flatMap((each) => [...each.targets]),
    near: (elements, isNear = true) => {
      act(() => {
        for (const observer of [...intersections]) {
          const entries = elements
            .filter((element) => observer.targets.has(element))
            .map((target) => ({ target, isIntersecting: isNear }) as IntersectionObserverEntry);
          if (entries.length > 0) observer.callback(entries, observer.self);
        }
      });
    },
    resize: (element, width) => {
      act(() => {
        for (const observer of [...resizes]) {
          if (observer.targets.has(element)) {
            observer.callback(
              [{ target: element, contentRect: { width } } as unknown as ResizeObserverEntry],
              observer.self,
            );
          }
        }
      });
    },
  };
}

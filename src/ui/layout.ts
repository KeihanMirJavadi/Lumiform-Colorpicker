/**
 * Preview splitter controller (V1.3, task 5.2).
 *
 * The splitter is a focusable `separator` between the 3D preview and the rest
 * of the dock. It owns pointer capture, the two snap stops and the keyboard
 * contract; the shell owns the actual height, the clamping policy and the
 * layout persistence.
 */

export interface SplitterBounds {
  min: number;
  max: number;
}

export interface SplitterSnaps {
  /** Height of the reference 412:227 frame at the current width. */
  reference: number;
  /** Height of the 1:1 frame at the current width. */
  square: number;
}

export interface SplitterOptions {
  element: HTMLElement;
  getBounds: () => SplitterBounds;
  getSnaps: () => SplitterSnaps;
  getHeight: () => number;
  setHeight: (height: number) => void;
  onCommit?: (height: number) => void;
  /** Keyboard step, in pixels. */
  step?: number;
  /** Shift + arrow step, in pixels. */
  largeStep?: number;
}

export interface SplitterController {
  /** Re-sync the aria values after the shell changes the height externally. */
  refresh: () => void;
  destroy: () => void;
}

export function bindSplitter(options: SplitterOptions): SplitterController {
  const { element } = options;
  const step = options.step ?? 8;
  const largeStep = options.largeStep ?? 32;

  let dragging = false;
  let pointerId: number | null = null;
  let startY = 0;
  let startHeight = 0;
  let frame = 0;
  let pendingHeight = 0;

  const clamp = (height: number): number => {
    const { min, max } = options.getBounds();
    return Math.max(Math.min(min, max), Math.min(height, max));
  };

  const applyPending = (): void => {
    frame = 0;
    options.setHeight(pendingHeight);
  };

  const schedule = (height: number): void => {
    pendingHeight = height;
    if (frame === 0) {
      frame = requestAnimationFrame(applyPending);
    }
  };

  const cancelPending = (): void => {
    if (frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };

  const refresh = (): void => {
    const { min, max } = options.getBounds();
    const height = Math.round(options.getHeight());
    element.setAttribute('aria-valuemin', String(Math.round(Math.min(min, max))));
    element.setAttribute('aria-valuemax', String(Math.round(max)));
    element.setAttribute('aria-valuenow', String(height));
    element.setAttribute('aria-valuetext', `${height} pixels tall`);
  };

  const commit = (): void => {
    // Flush the last scheduled move: a fast drag can end before its frame.
    if (frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
      options.setHeight(pendingHeight);
    }
    options.onCommit?.(options.getHeight());
    refresh();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging = true;
    pointerId = event.pointerId;
    startY = event.clientY;
    startHeight = options.getHeight();
    // Synthetic events (tests) have no active pointer to capture; the drag
    // still works because the element receives the following moves.
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      pointerId = null;
    }
    element.dataset.dragging = 'true';
    element.focus();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!dragging) return;
    event.preventDefault();
    schedule(clamp(startHeight + (event.clientY - startY)));
  };

  const endDrag = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    element.dataset.dragging = 'false';
    if (pointerId !== null && element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
    pointerId = null;
    if (event.type === 'pointerup') {
      commit();
    } else {
      cancelPending();
      refresh();
    }
  };

  const onDoubleClick = (event: MouseEvent): void => {
    event.preventDefault();
    const snaps = options.getSnaps();
    const current = options.getHeight();
    // Toggle to whichever calibrated shape is farther away.
    const toReference =
      Math.abs(current - snaps.square) <= Math.abs(current - snaps.reference);
    options.setHeight(clamp(toReference ? snaps.reference : snaps.square));
    options.onCommit?.(options.getHeight());
    refresh();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const snaps = options.getSnaps();
    let next: number;

    switch (event.key) {
      case 'ArrowUp':
        next = options.getHeight() - (event.shiftKey ? largeStep : step);
        break;
      case 'ArrowDown':
        next = options.getHeight() + (event.shiftKey ? largeStep : step);
        break;
      case 'Home':
        next = snaps.reference;
        break;
      case 'End':
        next = snaps.square;
        break;
      default:
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    options.setHeight(clamp(next));
    options.onCommit?.(options.getHeight());
    refresh();
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', endDrag);
  element.addEventListener('pointercancel', endDrag);
  element.addEventListener('dblclick', onDoubleClick);
  element.addEventListener('keydown', onKeyDown);

  refresh();

  return {
    refresh,
    destroy(): void {
      cancelPending();
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', endDrag);
      element.removeEventListener('pointercancel', endDrag);
      element.removeEventListener('dblclick', onDoubleClick);
      element.removeEventListener('keydown', onKeyDown);
    },
  };
}

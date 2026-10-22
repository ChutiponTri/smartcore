import { useEffect, useRef } from 'react';
import type { Direction, PointerControls, PosePreset } from './PointerInputSource';

const ARROWS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/**
 * Global keyboard bindings for the pointer source. Active whether or not the
 * panel is visible, so the operator can drive the session with the panel hidden.
 */
export function usePointerKeyboard(controls: PointerControls | null, onToggle: () => void) {
  const toggleRef = useRef(onToggle);
  useEffect(() => {
    toggleRef.current = onToggle;
  });

  useEffect(() => {
    if (!controls) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === '`' || e.code === 'Backquote') {
        if (isTyping(e.target)) return;
        e.preventDefault();
        toggleRef.current();
        return;
      }
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        controls.setPressing(true);
      } else if (ARROWS[e.key]) {
        e.preventDefault();
        controls.setArrow(ARROWS[e.key], true, e.shiftKey ? 'trunk' : 'pelvis');
      } else if (['1', '2', '3', '4'].includes(e.key) && !e.repeat) {
        controls.applyPreset(Number(e.key) as PosePreset);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (!isTyping(e.target)) e.preventDefault();
        controls.setPressing(false);
      } else if (ARROWS[e.key]) {
        controls.setArrow(ARROWS[e.key], false, 'pelvis');
      }
    };
    const blur = () => controls.setPressing(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [controls]);
}

/** Hold-to-press + wheel handlers to spread onto any surface (e.g. the game area). */
export function pressSurfaceHandlers(controls: PointerControls | null) {
  if (!controls) return {};
  return {
    onPointerDown: (e: { button: number; pointerId: number; currentTarget: EventTarget }) => {
      if (e.button !== 0) return;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      controls.setPressing(true);
    },
    onPointerUp: () => controls.setPressing(false),
    onPointerCancel: () => controls.setPressing(false),
    onWheel: (e: { deltaY: number }) => controls.nudgePressure(e.deltaY < 0 ? 1 : -1),
  };
}

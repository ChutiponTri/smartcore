import { useEffect, useState } from 'react';
import type { GameFrame, SoundCue } from '../sync/broadcast';
import { openChannel } from '../sync/broadcast';

/**
 * Game-side view of the session, fed only through the sync channel so the
 * game behaves the same in its own window or embedded in the therapist page.
 * Phaser scenes read `frame` every tick; React HUD subscribes at a lower rate.
 */
export class GameFeed {
  frame: GameFrame | null = null;
  lastFrameAt = 0;
  private cueListeners = new Set<(c: SoundCue) => void>();
  private frameListeners = new Set<(f: GameFrame) => void>();
  /** Opens the sync channel; returns the matching disconnect (use from an effect). */
  connect() {
    const ch = openChannel((m) => {
      if (m.kind === 'frame') {
        this.frame = m.frame;
        this.lastFrameAt = performance.now();
        this.frameListeners.forEach((l) => l(m.frame));
      } else if (m.kind === 'cue') {
        this.cueListeners.forEach((l) => l(m.cue));
      }
    });
    ch.post({ kind: 'hello' });
    return () => ch.close();
  }

  onCue(cb: (c: SoundCue) => void) {
    this.cueListeners.add(cb);
    return () => {
      this.cueListeners.delete(cb);
    };
  }

  onFrame(cb: (f: GameFrame) => void) {
    this.frameListeners.add(cb);
    return () => {
      this.frameListeners.delete(cb);
    };
  }

  /** True when frames are arriving (the host window is alive). */
  get live() {
    return performance.now() - this.lastFrameAt < 1500;
  }
}

/** Throttled React view of the feed (~10 Hz) plus a liveness flag. */
export function useFeedFrame(feed: GameFeed, hz = 10) {
  const [state, setState] = useState<{ frame: GameFrame | null; live: boolean }>({ frame: feed.frame, live: feed.live });
  useEffect(() => {
    const id = setInterval(() => setState({ frame: feed.frame, live: feed.live }), 1000 / hz);
    return () => clearInterval(id);
  }, [feed, hz]);
  return state;
}

/** Pressure → screen offset helpers shared by all games. */
export const PX_PER_MMHG = 34;
export function pressureOffsetPx(frame: GameFrame) {
  const mid = (frame.range.lo + frame.range.hi) / 2;
  return (frame.pressure - mid) * PX_PER_MMHG;
}
export function bandHalfPx(frame: GameFrame) {
  return ((frame.range.hi - frame.range.lo) / 2) * PX_PER_MMHG;
}

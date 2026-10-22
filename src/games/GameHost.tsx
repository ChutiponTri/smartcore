import Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import type { GameId } from '../scoring/session';
import { BalloonScene } from './BalloonHold/BalloonScene';
import { H, W } from './common';
import type { GameFeed } from './feed';
import { GAME_COLORS } from './palette';
import { BoatScene } from './SteadyBoat/BoatScene';

/** Embeds one Phaser game; recreated when the selected game changes. */
export function GameHost({ gameId, feed }: { gameId: GameId; feed: GameFeed }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = gameId === 'boat' ? new BoatScene(feed) : new BalloonScene(feed);
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: ref.current!,
      width: W,
      height: H,
      backgroundColor: GAME_COLORS.skyBottom,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      // Input is handled by the surrounding React surface (hold-to-press).
      input: { keyboard: false, mouse: false, touch: false, gamepad: false },
      audio: { noAudio: true },
      banner: false,
      fps: { target: 60 },
      scene,
    });
    return () => game.destroy(true);
  }, [gameId, feed]);

  return <div ref={ref} className="absolute inset-0" />;
}

import Phaser from 'phaser';
import type { SoundCue } from '../sync/broadcast';
import type { GameFeed } from './feed';
import { GAME_COLORS as C } from './palette';

export const W = 1280;
export const H = 720;
/** Vertical centre of the target zone, below the HUD bar. */
export const ZONE_Y = 410;
export const PLAY_TOP = 120;
export const PLAY_BOTTOM = 700;

export const smooth = (cur: number, target: number, dtMs: number, tauMs: number) =>
  cur + (target - cur) * (1 - Math.exp(-dtMs / tauMs));

/** Base scene: shared look (palette, clouds, status glyphs, confetti) for every game. */
export abstract class BaseGameScene extends Phaser.Scene {
  protected feed: GameFeed;
  private unsubCue: (() => void) | null = null;

  constructor(key: string, feed: GameFeed) {
    super(key);
    this.feed = feed;
  }

  protected listenCues(onCue: (c: SoundCue) => void) {
    this.unsubCue = this.feed.onCue(onCue);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubCue?.());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.unsubCue?.());
  }

  protected drawSky(top: number = C.skyTop, bottom: number = C.skyBottom) {
    const g = this.add.graphics();
    g.fillGradientStyle(top, top, bottom, bottom, 1);
    g.fillRect(0, 0, W, H);
    return g;
  }

  protected makeCloud(x: number, y: number, scale: number) {
    const g = this.add.graphics({ x, y });
    g.fillStyle(C.cloud, 0.95);
    g.fillEllipse(0, 0, 120, 46);
    g.fillEllipse(-36, 6, 70, 36);
    g.fillEllipse(38, 8, 80, 34);
    g.fillEllipse(6, -18, 70, 44);
    g.setScale(scale);
    return g;
  }

  protected drift(objs: Phaser.GameObjects.Components.Transform[], speeds: number[], dtMs: number, margin = 120) {
    objs.forEach((o, i) => {
      o.x += (speeds[i] * dtMs) / 1000;
      if (o.x > W + margin) o.x = -margin;
      if (o.x < -margin) o.x = W + margin;
    });
  }

  /** ✓ (in target) or ⚠ (needs adjustment) badge; never colour alone. */
  protected drawStatusGlyph(g: Phaser.GameObjects.Graphics, ok: boolean, r = 30) {
    g.clear();
    g.fillStyle(C.white, 1);
    g.fillCircle(0, 0, r + 4);
    if (ok) {
      g.fillStyle(C.zone, 1);
      g.fillCircle(0, 0, r);
      g.lineStyle(r * 0.22, C.white, 1);
      g.beginPath();
      g.moveTo(-r * 0.45, 0);
      g.lineTo(-r * 0.1, r * 0.35);
      g.lineTo(r * 0.5, -r * 0.35);
      g.strokePath();
    } else {
      g.fillStyle(C.warn, 1);
      g.fillTriangle(0, -r * 0.85, r * 0.9, r * 0.65, -r * 0.9, r * 0.65);
      g.fillStyle(C.white, 1);
      g.fillRoundedRect(-r * 0.09, -r * 0.4, r * 0.18, r * 0.6, r * 0.08);
      g.fillCircle(0, r * 0.4, r * 0.11);
    }
  }

  protected drawProgressRing(g: Phaser.GameObjects.Graphics, progress: number, r = 42) {
    g.clear();
    g.lineStyle(8, C.white, 0.6);
    g.strokeCircle(0, 0, r);
    if (progress > 0) {
      g.lineStyle(8, C.zoneEdge, 1);
      g.beginPath();
      g.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, progress), false);
      g.strokePath();
    }
  }

  /** Dashed horizontal band marking the target zone. */
  protected drawZoneBand(g: Phaser.GameObjects.Graphics, x0: number, x1: number, cy: number, half: number, glow: boolean) {
    g.clear();
    g.fillStyle(C.zone, glow ? 0.32 : 0.2);
    g.fillRoundedRect(x0, cy - half, x1 - x0, half * 2, 18);
    g.lineStyle(4, C.zoneEdge, 0.8);
    for (const y of [cy - half, cy + half]) {
      for (let x = x0 + 10; x < x1 - 10; x += 34) {
        g.lineBetween(x, y, Math.min(x + 18, x1 - 10), y);
      }
    }
  }

  protected confetti(x: number, y: number, n = 26) {
    const colors = [C.balloon, C.boat, C.zone, 0x8fb8ff, 0xf6a5c0];
    for (let i = 0; i < n; i++) {
      const p = this.add.rectangle(x, y, 12, 7, colors[i % colors.length]).setDepth(50);
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.3;
      const d = 120 + Math.random() * 90;
      this.tweens.add({
        targets: p,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d + 60,
        angle: Math.random() * 360,
        alpha: 0,
        duration: 1100 + Math.random() * 300,
        ease: 'Cubic.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  /** Arrow hint pointing where the object needs to go (up = press more). */
  protected drawHintArrow(g: Phaser.GameObjects.Graphics, dir: -1 | 0 | 1) {
    g.clear();
    if (dir === 0) return;
    g.fillStyle(C.ink, 0.75);
    const s = dir; // -1 up, 1 down
    g.fillTriangle(0, s * 26, -22, s * -4, 22, s * -4);
    g.fillRoundedRect(-8, s > 0 ? -30 : 0, 16, 30, 6);
  }
}

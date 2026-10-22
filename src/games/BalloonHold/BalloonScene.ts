import Phaser from 'phaser';
import { BaseGameScene, H, PLAY_BOTTOM, PLAY_TOP, W, ZONE_Y, smooth } from '../common';
import type { GameFeed } from '../feed';
import { bandHalfPx, pressureOffsetPx } from '../feed';
import { GAME_COLORS as C } from '../palette';

const BALLOON_X = W / 2;

/**
 * Balloon Hold: balloon height follows bladder pressure; keep it inside the
 * band. During compensation the balloon wobbles and the hold timer pauses.
 */
export class BalloonScene extends BaseGameScene {
  private clouds: Phaser.GameObjects.Graphics[] = [];
  private zone!: Phaser.GameObjects.Graphics;
  private balloon!: Phaser.GameObjects.Container;
  private string!: Phaser.GameObjects.Graphics;
  private glyph!: Phaser.GameObjects.Graphics;
  private ring!: Phaser.GameObjects.Graphics;
  private arrow!: Phaser.GameObjects.Graphics;
  private y = ZONE_Y + 120;
  private wobble = 0;
  private lastOk: boolean | null = null;
  private zoneHalf = 0;

  constructor(feed: GameFeed) {
    super('balloon', feed);
  }

  create() {
    this.drawSky();
    const sun = this.add.graphics({ x: 1110, y: 175 });
    sun.fillStyle(0xfff1a8, 0.5);
    sun.fillCircle(0, 0, 70);
    sun.fillStyle(0xffe27a, 1);
    sun.fillCircle(0, 0, 48);

    this.clouds = [
      this.makeCloud(180, 200, 1),
      this.makeCloud(560, 150, 0.7),
      this.makeCloud(900, 260, 0.9),
      this.makeCloud(1180, 520, 0.6),
      this.makeCloud(80, 560, 0.75),
    ];

    const hills = this.add.graphics();
    hills.fillStyle(C.hillBack, 1);
    hills.fillEllipse(260, H + 60, 900, 260);
    hills.fillStyle(C.hillFront, 1);
    hills.fillEllipse(1000, H + 80, 1000, 260);

    this.zone = this.add.graphics();
    this.ring = this.add.graphics({ x: 1090, y: ZONE_Y });
    this.glyph = this.add.graphics({ x: 1090, y: ZONE_Y });

    this.string = this.add.graphics();
    const body = this.add.graphics();
    body.fillStyle(C.balloonDark, 1);
    body.fillTriangle(-10, 66, 10, 66, 0, 54);
    body.fillStyle(C.balloon, 1);
    body.fillEllipse(0, 0, 112, 132);
    body.fillStyle(C.white, 0.45);
    body.fillEllipse(-24, -26, 22, 40);
    // face: calm, friendly
    body.fillStyle(C.ink, 0.85);
    body.fillCircle(-17, 2, 5);
    body.fillCircle(17, 2, 5);
    body.lineStyle(4, C.ink, 0.85);
    body.beginPath();
    body.arc(0, 12, 14, 0.2 * Math.PI, 0.8 * Math.PI, false);
    body.strokePath();
    this.balloon = this.add.container(BALLOON_X, this.y, [body]);
    this.arrow = this.add.graphics({ x: BALLOON_X + 110, y: this.y });

    this.listenCues((c) => {
      if (c === 'pass' || c === 'finish') this.confetti(BALLOON_X, this.y);
    });
  }

  update(time: number, delta: number) {
    this.drift(this.clouds, [14, 9, 12, 7, 10], delta, 160);
    const f = this.feed.frame;

    const half = f ? bandHalfPx(f) : 68;
    this.zoneHalf = smooth(this.zoneHalf || half, half, delta, 200);
    const inZone = !!f && f.A;
    const active = !!f && f.connected && f.phase !== 'rest';
    this.drawZoneBand(this.zone, 140, W - 260, ZONE_Y, this.zoneHalf, inZone && f!.B);

    // Height follows pressure (higher pressure → higher balloon).
    const target = f && f.connected ? ZONE_Y - pressureOffsetPx(f) : ZONE_Y + 150 + Math.sin(time / 900) * 8;
    const clamped = Phaser.Math.Clamp(target, PLAY_TOP + 70, PLAY_BOTTOM - 70);
    this.y = smooth(this.y, clamped, delta, 110);

    // Gentle idle sway; a clear wobble while compensating.
    const comp = !!f?.compensation;
    this.wobble = smooth(this.wobble, comp ? 1 : 0, delta, 180);
    const sway = Math.sin(time / 700) * 3 * (1 - this.wobble) + Math.sin(time / 110) * 9 * this.wobble;
    const tiltDir = f ? Math.sign(f.pelvisObliquity || f.pelvisTilt) : 0;
    this.balloon.setPosition(BALLOON_X + Math.sin(time / 1300) * 6, this.y);
    this.balloon.setAngle(sway + tiltDir * 6 * this.wobble);

    this.string.clear();
    this.string.lineStyle(3, C.ink, 0.6);
    const sx = this.balloon.x;
    const sy = this.y + 66;
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(sx, sy),
      new Phaser.Math.Vector2(sx + Math.sin(time / 500) * 18, sy + 60),
      new Phaser.Math.Vector2(sx - 4, sy + 120),
    );
    curve.draw(this.string, 24);

    const ok = active && inZone && !comp;
    if (ok !== this.lastOk) {
      this.drawStatusGlyph(this.glyph, ok);
      this.lastOk = ok;
    }
    this.drawProgressRing(this.ring, f?.phase === 'hold' ? f.holdProgress : 0);

    // Arrow hint only for pressure (the edge glow handles posture).
    let dir: -1 | 0 | 1 = 0;
    if (active && f && !f.A) dir = f.pressure < f.range.lo ? -1 : 1;
    this.drawHintArrow(this.arrow, dir);
    this.arrow.setPosition(this.balloon.x + 120, this.y);
    this.arrow.setAlpha(0.55 + 0.45 * Math.sin(time / 260) ** 2);
  }
}

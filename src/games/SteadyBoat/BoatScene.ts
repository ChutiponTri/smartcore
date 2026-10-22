import Phaser from 'phaser';
import { BaseGameScene, H, W, ZONE_Y, smooth } from '../common';
import type { GameFeed } from '../feed';
import { bandHalfPx, pressureOffsetPx } from '../feed';
import { GAME_COLORS as C } from '../palette';

const BOAT_X = 330;
const BANK_TOP = 150;
const BANK_BOTTOM = 680;
const GATE_EVERY_MS = 2600;
const CRUISE = 230; // px/s while holding
const IDLE = 50;

type Gate = { x: number; half: number; g: Phaser.GameObjects.Graphics; judged: boolean };

/**
 * Steady Boat (top-down river): the boat sails forward on its own; its
 * position across the river follows bladder pressure. Steer through the buoy
 * gates. Gate width follows the difficulty (target band width).
 */
export class BoatScene extends BaseGameScene {
  private waves: Phaser.GameObjects.Graphics[] = [];
  private gates: Gate[] = [];
  private guide!: Phaser.GameObjects.Graphics;
  private boat!: Phaser.GameObjects.Container;
  private glyph!: Phaser.GameObjects.Graphics;
  private ring!: Phaser.GameObjects.Graphics;
  private arrow!: Phaser.GameObjects.Graphics;
  private y = ZONE_Y + 120;
  private speed = IDLE;
  private sinceGate = GATE_EVERY_MS * 0.6;
  private sinceWake = 0;
  private wobble = 0;
  private lastOk: boolean | null = null;

  constructor(feed: GameFeed) {
    super('boat', feed);
  }

  create() {
    const water = this.add.graphics();
    water.fillGradientStyle(C.waterLight, C.waterLight, C.water, C.water, 1);
    water.fillRect(0, 0, W, H);

    for (let i = 0; i < 18; i++) {
      const g = this.add.graphics({ x: Math.random() * W, y: BANK_TOP + 30 + Math.random() * (BANK_BOTTOM - BANK_TOP - 60) });
      g.lineStyle(4, C.white, 0.35);
      g.beginPath();
      g.arc(0, 0, 18, Math.PI * 1.15, Math.PI * 1.85, false);
      g.strokePath();
      this.waves.push(g);
    }

    this.guide = this.add.graphics();

    // Banks with round trees (same flat style as the other games)
    const banks = this.add.graphics().setDepth(20);
    banks.fillStyle(C.hillFront, 1);
    banks.fillRect(0, 0, W, BANK_TOP);
    banks.fillRect(0, BANK_BOTTOM, W, H - BANK_BOTTOM);
    banks.fillStyle(C.hillBack, 1);
    banks.fillRect(0, BANK_TOP - 14, W, 14);
    banks.fillRect(0, BANK_BOTTOM, W, 12);
    for (let x = 40; x < W; x += 150) {
      banks.fillStyle(0x5fae84, 1);
      banks.fillCircle(x, BANK_TOP - 40, 30);
      banks.fillCircle(x + 70, H - 14, 26);
    }

    this.ring = this.add.graphics({ x: 1150, y: ZONE_Y }).setDepth(30);
    this.glyph = this.add.graphics({ x: 1150, y: ZONE_Y }).setDepth(31);

    const hull = this.add.graphics();
    hull.fillStyle(C.boatDark, 1);
    hull.fillPoints(
      [
        new Phaser.Math.Vector2(-70, -34),
        new Phaser.Math.Vector2(40, -34),
        new Phaser.Math.Vector2(82, 0),
        new Phaser.Math.Vector2(40, 34),
        new Phaser.Math.Vector2(-70, 34),
      ],
      true,
    );
    hull.fillStyle(C.boat, 1);
    hull.fillPoints(
      [
        new Phaser.Math.Vector2(-62, -26),
        new Phaser.Math.Vector2(36, -26),
        new Phaser.Math.Vector2(68, 0),
        new Phaser.Math.Vector2(36, 26),
        new Phaser.Math.Vector2(-62, 26),
      ],
      true,
    );
    hull.fillStyle(C.white, 1);
    hull.fillRoundedRect(-40, -16, 50, 32, 10);
    hull.fillStyle(C.balloon, 1);
    hull.fillCircle(-14, 0, 13);
    this.boat = this.add.container(BOAT_X, this.y, [hull]).setDepth(10);
    this.arrow = this.add.graphics().setDepth(12);

    this.listenCues((c) => {
      if (c === 'pass' || c === 'finish') this.confetti(BOAT_X, this.y);
    });
  }

  update(time: number, delta: number) {
    const f = this.feed.frame;
    const holding = !!f && f.connected && f.phase === 'hold';
    const half = f ? bandHalfPx(f) : 68;
    this.speed = smooth(this.speed, holding ? CRUISE : IDLE, delta, 600);
    const dx = (this.speed * delta) / 1000;

    for (const w of this.waves) {
      w.x -= dx * 0.8;
      if (w.x < -40) {
        w.x = W + 40;
        w.y = BANK_TOP + 30 + Math.random() * (BANK_BOTTOM - BANK_TOP - 60);
      }
    }

    // faint lane guides at the band edges
    this.guide.clear();
    this.guide.lineStyle(3, C.white, 0.35);
    for (const y of [ZONE_Y - half, ZONE_Y + half]) {
      for (let x = ((-time / 20) % 40) - 40; x < W; x += 40) this.guide.lineBetween(x, y, x + 18, y);
    }

    // gates
    if (holding) {
      this.sinceGate += delta;
      if (this.sinceGate > GATE_EVERY_MS) {
        this.sinceGate = 0;
        this.spawnGate(half);
      }
    }
    for (const gate of this.gates) {
      gate.x -= dx;
      gate.g.x = gate.x;
      if (!gate.judged && gate.x <= BOAT_X) {
        gate.judged = true;
        this.judgeGate(!!f && f.A && f.B);
      }
    }
    this.gates = this.gates.filter((g) => {
      if (g.x < -80) {
        g.g.destroy();
        return false;
      }
      return true;
    });

    // boat position across the river follows pressure
    const target = f && f.connected ? ZONE_Y - pressureOffsetPx(f) : ZONE_Y + Math.sin(time / 1100) * 10;
    this.y = smooth(this.y, Phaser.Math.Clamp(target, BANK_TOP + 40, BANK_BOTTOM - 40), delta, 120);

    // compensation → boat lists to the side and rocks
    const comp = !!f?.compensation;
    this.wobble = smooth(this.wobble, comp ? 1 : 0, delta, 160);
    const lean = f ? Phaser.Math.Clamp(f.pelvisObliquity || f.pelvisTilt, -1, 1) : 0;
    this.boat.setPosition(BOAT_X, this.y + Math.sin(time / 500) * 3);
    this.boat.setAngle(Math.sin(time / 600) * 2 + (lean * 14 + Math.sin(time / 120) * 6) * this.wobble);
    this.boat.setScale(1, 1 - 0.18 * this.wobble);

    this.sinceWake += delta;
    if (this.sinceWake > 90 && this.speed > 80) {
      this.sinceWake = 0;
      this.wake();
    }

    const active = !!f && f.connected && f.phase !== 'rest';
    const ok = active && !!f && f.A && !comp;
    if (ok !== this.lastOk) {
      this.drawStatusGlyph(this.glyph, ok);
      this.lastOk = ok;
    }
    this.drawProgressRing(this.ring, holding ? f!.holdProgress : 0);

    let dir: -1 | 0 | 1 = 0;
    if (active && f && !f.A) dir = f.pressure < f.range.lo ? -1 : 1;
    this.drawHintArrow(this.arrow, dir);
    this.arrow.setPosition(BOAT_X + 130, this.y);
    this.arrow.setAlpha(0.55 + 0.45 * Math.sin(time / 260) ** 2);
  }

  private spawnGate(half: number) {
    const g = this.add.graphics({ x: W + 60, y: 0 }).setDepth(5);
    g.fillStyle(C.zone, 0.22);
    g.fillRoundedRect(-26, ZONE_Y - half, 52, half * 2, 14);
    for (const y of [ZONE_Y - half - 22, ZONE_Y + half + 22]) {
      g.fillStyle(C.white, 1);
      g.fillCircle(0, y, 22);
      g.lineStyle(6, C.zoneEdge, 1);
      g.strokeCircle(0, y, 22);
      g.fillStyle(C.balloon, 1);
      g.fillCircle(0, y, 8);
    }
    this.gates.push({ x: W + 60, half, g, judged: false });
  }

  private judgeGate(ok: boolean) {
    const g = this.add.graphics({ x: BOAT_X + 20, y: this.y - 80 }).setDepth(40);
    this.drawStatusGlyph(g, ok, 24);
    this.tweens.add({ targets: g, y: g.y - 50, alpha: 0, duration: 1000, ease: 'Sine.easeOut', onComplete: () => g.destroy() });
    if (!ok) {
      for (let i = 0; i < 8; i++) {
        const d = this.add.circle(BOAT_X + 40, this.y, 6, C.white, 0.9).setDepth(9);
        const a = (Math.PI * 2 * i) / 8;
        this.tweens.add({ targets: d, x: d.x + Math.cos(a) * 50, y: d.y + Math.sin(a) * 50, alpha: 0, duration: 600, onComplete: () => d.destroy() });
      }
    }
  }

  private wake() {
    for (const s of [-1, 1]) {
      const e = this.add.ellipse(BOAT_X - 70, this.y + s * 18, 22, 10, C.white, 0.6).setDepth(8);
      this.tweens.add({
        targets: e,
        x: e.x - 160,
        y: e.y + s * 30,
        alpha: 0,
        scaleX: 2,
        duration: 1200,
        onComplete: () => e.destroy(),
      });
    }
  }
}

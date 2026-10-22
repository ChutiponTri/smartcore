/** Shared visual language for every game (flat, bright but soft). */
export const GAME_COLORS = {
  skyTop: 0x9fd8f5,
  skyBottom: 0xe6f6fd,
  hillBack: 0xa8dcc0,
  hillFront: 0x7cc7a0,
  water: 0x5bb8d8,
  waterDeep: 0x3f9fc6,
  waterLight: 0x8fd3ea,
  cloud: 0xffffff,
  zone: 0x2bb3a3,
  zoneEdge: 0x168f82,
  balloon: 0xff8a65,
  balloonDark: 0xe0684a,
  boat: 0xffc94d,
  boatDark: 0xe0a92b,
  sail: 0xffffff,
  warn: 0xff9f1c,
  ink: 0x24415a,
  inkSoft: 0x5b7489,
  white: 0xffffff,
  restTop: 0x6a7fd0,
  restBottom: 0xc6b6ea,
  star: 0xfff6c9,
} as const;

export const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

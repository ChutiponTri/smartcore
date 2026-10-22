import type { ReactNode } from 'react';
import { GAME_COLORS as C, css } from './palette';

function Frame({ children, sky = true }: { children: ReactNode; sky?: boolean }) {
  return (
    <svg viewBox="0 0 160 96" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="thumb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={css(C.skyTop)} />
          <stop offset="1" stopColor={css(C.skyBottom)} />
        </linearGradient>
      </defs>
      {sky && <rect width="160" height="96" fill="url(#thumb-sky)" />}
      {children}
    </svg>
  );
}

export function BalloonThumb() {
  return (
    <Frame>
      <ellipse cx="40" cy="104" rx="70" ry="30" fill={css(C.hillBack)} />
      <ellipse cx="130" cy="108" rx="70" ry="30" fill={css(C.hillFront)} />
      <rect x="0" y="34" width="160" height="22" fill={css(C.zone)} opacity="0.25" />
      <path d="M0 34h160M0 56h160" stroke={css(C.zoneEdge)} strokeDasharray="5 4" strokeWidth="1.5" />
      <path d="M80 62 q-3 10 1 20" stroke={css(C.ink)} strokeWidth="1.2" fill="none" />
      <ellipse cx="80" cy="44" rx="13" ry="16" fill={css(C.balloon)} />
      <path d="M77 59h6l-3 4z" fill={css(C.balloonDark)} />
      <ellipse cx="75" cy="38" rx="3" ry="5" fill="#fff" opacity="0.55" />
    </Frame>
  );
}

export function BoatThumb() {
  return (
    <Frame sky={false}>
      <rect width="160" height="96" fill={css(C.water)} />
      <path d="M0 20 q20 -6 40 0 t40 0 t40 0 t40 0" stroke={css(C.waterLight)} strokeWidth="2" fill="none" />
      <path d="M0 78 q20 -6 40 0 t40 0 t40 0 t40 0" stroke={css(C.waterLight)} strokeWidth="2" fill="none" />
      {[70, 130].map((x) => (
        <g key={x}>
          <circle cx={x} cy="30" r="6" fill="#fff" stroke={css(C.zoneEdge)} strokeWidth="2" />
          <circle cx={x} cy="66" r="6" fill="#fff" stroke={css(C.zoneEdge)} strokeWidth="2" />
          <rect x={x - 3} y="36" width="6" height="24" fill={css(C.zone)} opacity="0.3" />
        </g>
      ))}
      <path d="M22 40h30l8 8-8 8H22z" fill={css(C.boat)} stroke={css(C.boatDark)} strokeWidth="2" />
      <circle cx="36" cy="48" r="5" fill="#fff" />
    </Frame>
  );
}

export function GardenThumb() {
  return (
    <Frame>
      <rect y="64" width="160" height="32" fill={css(C.hillFront)} />
      {[50, 110].map((x, i) => (
        <g key={x}>
          <path d={`M${x} 64v-${24 + i * 8}`} stroke="#3f8f5f" strokeWidth="3" />
          <circle cx={x} cy={36 - i * 8} r="10" fill={i ? '#f6a5c0' : '#ffd166'} />
          <circle cx={x} cy={36 - i * 8} r="4" fill="#fff8e1" />
        </g>
      ))}
    </Frame>
  );
}

export function QuestThumb() {
  return (
    <Frame>
      <path d="M0 80 L40 50 L70 66 L110 30 L160 70 V96 H0z" fill={css(C.hillBack)} />
      <path d="M110 30v-14l14 5-14 5" fill={css(C.balloon)} stroke={css(C.ink)} strokeWidth="1.5" />
      <circle cx="44" cy="44" r="6" fill={css(C.boat)} />
    </Frame>
  );
}

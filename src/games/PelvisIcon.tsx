import type { CompensationType } from '../scoring/rules';

/**
 * Small pelvis glyph that shows which way the pelvis drifted — direction only,
 * no numbers. Obliquity rotates the bowl; tilt shows a forward/back arrow.
 */
export function PelvisIcon({ comp, obliquity }: { comp: CompensationType; obliquity: number }) {
  const roll = comp === 'lateral_tilt' ? Math.max(-22, Math.min(22, obliquity * 3)) : 0;
  const arrow = comp === 'anterior_tilt' ? 'up' : comp === 'posterior_tilt' ? 'down' : null;
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden>
      <circle cx="60" cy="60" r="56" fill="#fff" />
      <circle cx="60" cy="60" r="56" fill="none" stroke="#ff9f1c" strokeWidth="6" />
      <g transform={`rotate(${roll} 60 64)`}>
        {comp === 'lumbar_extension' ? (
          // arched back silhouette
          <g fill="none" stroke="#24415a" strokeWidth="8" strokeLinecap="round">
            <path d="M24 78 Q60 30 96 78" />
            <path d="M60 46 v-14" stroke="#ff9f1c" />
            <path d="M52 38 l8 -10 l8 10" stroke="#ff9f1c" />
          </g>
        ) : (
          <g>
            <path d="M24 46 Q30 30 46 36 L60 52 L74 36 Q90 30 96 46 Q96 72 78 84 L60 90 L42 84 Q24 72 24 46Z" fill="#ffd9a8" stroke="#24415a" strokeWidth="5" strokeLinejoin="round" />
            <circle cx="60" cy="72" r="8" fill="#fff" stroke="#24415a" strokeWidth="4" />
          </g>
        )}
      </g>
      {arrow && (
        <g fill="#ff9f1c" stroke="#fff" strokeWidth="3" strokeLinejoin="round">
          {arrow === 'up' ? <path d="M60 4 l16 18 h-10 v12 h-12 v-12 h-10z" /> : <path d="M60 116 l16 -18 h-10 v-12 h-12 v12 h-10z" />}
        </g>
      )}
      {comp === 'lateral_tilt' && (
        <g fill="#ff9f1c" stroke="#fff" strokeWidth="3" strokeLinejoin="round">
          {obliquity > 0 ? <path d="M116 60 l-18 16 v-10 h-10 v-12 h10 v-10z" /> : <path d="M4 60 l18 16 v-10 h10 v-12 h-10 v-10z" />}
        </g>
      )}
    </svg>
  );
}

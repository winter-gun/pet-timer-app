import { usePetStore } from '@shared/store/petStore';
import { useLevelStore } from '@shared/store/levelStore';

// Cloud-shaped name bubble. Drawn as overlapping ellipses + a connecting rect
// so the silhouette feels bumpy on top and rounded at the bottom. Two trailing
// circles point toward the pet's head below.
//
// Sized for the medium pet window (200×280). The whole SVG inherits the
// drop-shadow from the wrapper's CSS filter, so we don't need an SVG filter
// element (which would double-render the shadow on each ellipse).

const VIEW_W = 132;
const VIEW_H = 70;

function truncate(name: string, max = 8): string {
  return name.length > max ? `${name.slice(0, max)}…` : name;
}

export default function SpeechBubble() {
  const name = usePetStore((s) => s.name);
  const justLeveledUpTo = useLevelStore((s) => s.justLeveledUpTo);

  // Level-up overrides the name so the celebration is visible even for pets
  // without a custom name. Without an override, fall back to the name; if
  // there's neither, hide the bubble entirely.
  const text = justLeveledUpTo != null ? '레벨 업!' : (name ? truncate(name) : null);
  if (text == null) return null;

  return (
    <div
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 select-none"
      style={{
        top: 0,
        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.15))',
      }}
    >
      <svg
        width={VIEW_W}
        height={VIEW_H}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        aria-hidden
      >
        <g fill="white">
          {/* Bumpy top — five overlapping ellipses across the width */}
          <ellipse cx="22" cy="32" rx="16" ry="13" />
          <ellipse cx="46" cy="22" rx="20" ry="16" />
          <ellipse cx="70" cy="20" rx="20" ry="17" />
          <ellipse cx="93" cy="24" rx="18" ry="15" />
          <ellipse cx="113" cy="33" rx="14" ry="12" />
          {/* Connector that fills the gap between the ellipses' lower edges */}
          <rect x="18" y="28" width="100" height="18" rx="9" />
          {/* Trailing tail circles pointing down-left toward the pet */}
          <circle cx="62" cy="52" r="4" />
          <circle cx="58" cy="62" r="2.5" />
        </g>
        <text
          x={VIEW_W / 2}
          y="34"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="13"
          fill="#333"
          fontFamily="inherit"
          style={{ fontWeight: 500 }}
        >
          {text}
        </text>
      </svg>
    </div>
  );
}
